import os
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from elasticsearch import Elasticsearch
from opentelemetry import trace, propagate
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

# Initialize OpenTelemetry
resource = Resource(attributes={
    ResourceAttributes.SERVICE_NAME: "weather-api-backend",
    ResourceAttributes.DEPLOYMENT_ENVIRONMENT: "development",
})

provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter(
    endpoint="http://otel-collector:4318/v1/traces"
))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

# Set propagator for distributed tracing (extracts trace context from requests)
propagate.set_global_textmap(TraceContextTextMapPropagator())

# Get tracer
tracer = trace.get_tracer(__name__)

# Create FastAPI app
app = FastAPI(title="Weather API Backend")

# Add CORS middleware - must explicitly allow trace context headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1234"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["traceparent", "tracestate"],  # Expose trace context headers
)

# Instrument FastAPI
FastAPIInstrumentor.instrument_app(app)

# Environment variables
ES_ENDPOINT = os.getenv("ELASTICSEARCH_ENDPOINT", "").rstrip("/").replace("/:443", ":443").replace("/:9200", ":9200")
ES_API_KEY = os.getenv("ELASTICSEARCH_API")
CACHE_INDEX = os.getenv("CACHE_INDEX", "weather-cache")

print(f"Elasticsearch endpoint: {ES_ENDPOINT}")
print(f"Cache index: {CACHE_INDEX}")

# Initialize Elasticsearch client if configured
es_client = None
if ES_ENDPOINT and ES_API_KEY:
    es_client = Elasticsearch(
        [ES_ENDPOINT],
        api_key=ES_API_KEY
    )

    # Ensure the cache index exists
    try:
        if not es_client.indices.exists(index=CACHE_INDEX):
            es_client.indices.create(
                index=CACHE_INDEX,
                mappings={
                    "properties": {
                        "city": {"type": "keyword"},
                        "timestamp": {"type": "date"},
                        "weather": {"type": "object", "enabled": False}
                    }
                }
            )
            print(f"Created index: {CACHE_INDEX}")
        else:
            print(f"Index {CACHE_INDEX} already exists")
    except Exception as e:
        print(f"Error checking/creating index: {e}")


# Request model for cache write
class CacheWriteRequest(BaseModel):
    city: str
    weather_data: dict


@app.get("/")
async def root():
    return {"message": "Weather Cache Backend", "service": "weather-cache-backend"}


@app.get("/health")
async def health():
    return {"status": "healthy", "cache_enabled": es_client is not None}


@app.get("/api/cache/check")
async def check_cache(city: str):
    """Check if weather data is cached for a city"""

    if not es_client:
        return {"cached": False, "data": None, "reason": "cache_disabled"}

    with tracer.start_as_current_span("cache.check") as span:
        span.set_attribute("cache.backend", "elasticsearch")
        span.set_attribute("cache.key", city)

        try:
            doc_id = city.lower().replace(" ", "-")
            # ignore=[404] prevents exception on cache miss
            result = es_client.get(index=CACHE_INDEX, id=doc_id, ignore=[404])

            # Check if document was found
            if not result.get("found", False):
                span.set_attribute("cache.hit", False)
                span.set_attribute("cache.miss_reason", "not_found")
                print(f"Cache miss for {city}: document not found")
                return {"cached": False, "data": None, "reason": "not_found"}

            cache_data = result["_source"]
            cache_time = datetime.fromisoformat(cache_data["timestamp"].replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - cache_time).total_seconds()
            is_fresh = age_seconds < 3600  # 1 hour TTL

            span.set_attribute("cache.hit", True)
            span.set_attribute("cache.age_seconds", int(age_seconds))
            span.set_attribute("cache.fresh", is_fresh)

            print(f"Cache hit for {city}, age: {int(age_seconds)}s, fresh: {is_fresh}")

            if is_fresh:
                return {
                    "cached": True,
                    "data": cache_data["weather"],
                    "age_seconds": int(age_seconds)
                }
            else:
                return {
                    "cached": False,
                    "data": None,
                    "reason": "expired",
                    "age_seconds": int(age_seconds)
                }

        except Exception as e:
            # Only catch unexpected errors (not 404s)
            span.set_attribute("cache.hit", False)
            span.set_attribute("cache.error", str(type(e).__name__))
            print(f"Cache error for {city}: {e}")
            return {"cached": False, "data": None, "reason": "error"}


@app.post("/api/cache/write")
async def write_cache(request: CacheWriteRequest):
    """Write weather data to cache"""

    if not es_client:
        raise HTTPException(status_code=503, detail="Cache not configured")

    with tracer.start_as_current_span("cache.write") as span:
        span.set_attribute("cache.backend", "elasticsearch")
        span.set_attribute("cache.key", request.city)

        try:
            doc_id = request.city.lower().replace(" ", "-")
            cache_doc = {
                "city": request.city,
                "weather": request.weather_data,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            es_client.index(index=CACHE_INDEX, id=doc_id, document=cache_doc)
            span.set_attribute("cache.write.success", True)
            print(f"Cached weather data for {request.city}")

            return {"success": True, "city": request.city}

        except Exception as e:
            span.set_attribute("cache.write.success", False)
            span.set_attribute("cache.error", str(e))
            print(f"Cache write error for {request.city}: {e}")
            raise HTTPException(status_code=500, detail=f"Cache write failed: {str(e)}")
