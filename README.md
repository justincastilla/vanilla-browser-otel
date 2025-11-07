# Vanilla Browser OpenTelemetry with Elastic Observability

This project demonstrates a minimal, framework-agnostic example of capturing browser telemetry using OpenTelemetry and sending it to Elastic Observability. It walks through a progression from manual instrumentation, to automatic instrumentation, and a final hybrid approach, showing each step in action. Accompanying slides may be found [here](slides/Linuxfest%20Northwest%20-%20Observability%20is%20for%20Frontend,%20Too!.pdf).

## Why This Architecture?

This demo uses a **distributed tracing architecture** designed for learning:

- ✅ **Browser → Backend → Elasticsearch** - Full distributed tracing with cache-first pattern
- ✅ **Browser → OTel Collector → Elastic APM** - All telemetry centralized
- ✅ **Vendor-neutral** - Uses OTLP standard, works with any OTLP-compatible backend
- ✅ **Production patterns** - BatchSpanProcessor, W3C Trace Context propagation, CORS handling
- ✅ **Hybrid instrumentation** - Automatic + manual spans working together

The OpenTelemetry Collector handles CORS directly (no reverse proxy needed), and the FastAPI backend demonstrates distributed tracing across services while solving CORS issues with Elasticsearch.

## 1. Quick Start (Recommended)

**Using Docker Compose is the recommended way to run this project.** It handles all dependencies and configuration automatically.

```bash
# Clone the repository
git clone https://github.com/justincastilla/vanilla-browser-otel.git
cd vanilla-browser-otel

# Copy environment file
cp .env.example .env
# Edit .env with your credentials (see section 2 below)

# Start all services with one command
docker-compose up
```

This starts:
- **Frontend** (Parcel dev server) on http://localhost:1234
- **Backend** (FastAPI) on http://localhost:8000
- **OTel Collector** on http://localhost:4318

### Local Development (Alternative)

If you prefer to run services locally without Docker:

```bash
npm install

# In one terminal - start the collector
cd otel-collector && docker run -v $(pwd)/otel-collector-config.yaml:/etc/otelcol/config.yaml -p 4318:4318 otel/opentelemetry-collector-contrib

# In another terminal - start the backend
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# In another terminal - start the frontend
npm run dev
```



## 2. Getting API Keys and Endpoints

You will need credentials for Elastic APM to send telemetry data. Here's how:

1. Log into your [Elastic Cloud Console](https://cloud.elastic.co/).
2. Create or select an existing deployment optimized for Observability.
3. Navigate to **Observability > APM** and note the following:
   - APM Server URL (e.g., `https://<your-deployment>.apm.us-central1.gcp.elastic-cloud.com`)
   - API Key for sending data securely
4. (Optional) For the Elasticsearch caching demo, you'll also need:
   - Elasticsearch endpoint (e.g., `https://<your-deployment>.es.us-west1.gcp.elastic.cloud:443`)
   - Elasticsearch API Key
5. Get a free Weather API key from [weatherapi.com](https://www.weatherapi.com/)

Create a `.env` file in your root directory and copy from `.env.example`:

```bash
cp .env.example .env
```

Then fill in the values:
```bash
# Required - Elastic APM
ELASTIC_ENDPOINT='https://<your-deployment>.apm.us-central1.gcp.elastic-cloud.com'
ELASTIC_TOKEN='ApiKey your-token-here'

# Required - Weather API
WEATHER_API_KEY='your-weather-api-key-here'

# Optional - Elasticsearch caching (for distributed tracing demo)
ELASTICSEARCH_ENDPOINT='https://<your-deployment>.es.us-west1.gcp.elastic.cloud:443'
ELASTICSEARCH_API='your-base64-encoded-api-key'
CACHE_INDEX='weather-cache'
```

**Important**:
- The `ELASTIC_TOKEN` must be in the format `ApiKey <your-token>`, not `Bearer <your-token>`
- The `ELASTICSEARCH_ENDPOINT` should use `.es.` (not `.kb.`) in the URL



## 3. Architecture Components

### Frontend (Parcel + OpenTelemetry Web SDK)
- **Parcel**: Zero-config bundler serving `index.html` and `app.js` with hot module reloading
- **OpenTelemetry Web SDK**: Instruments browser with `BatchSpanProcessor` (batches spans every 1 second)
- **W3C Trace Context Propagator**: Sends `traceparent` headers to backend for distributed tracing
- **Hybrid Instrumentation**: Combines automatic (fetch, user-interaction) + manual spans

### Backend (FastAPI + OpenTelemetry Python SDK)
- **FastAPI**: Handles Elasticsearch caching operations (`/api/cache/check`, `/api/cache/write`)
- **Purpose**: Solves CORS issues with direct browser → Elasticsearch calls
- **Demonstrates**: Distributed tracing across services with parent-child span relationships
- **OpenTelemetry**: Automatic FastAPI instrumentation + manual cache operation spans

### OpenTelemetry Collector
- Receives telemetry from both frontend (browser) and backend (FastAPI) via HTTP on port 4318
- CORS enabled to accept requests from localhost:1234 and localhost:8000
- Exports all traces to Elastic APM using OTLP exporter
- Benefits:
  - Vendor-neutral OTLP standard
  - Centralized telemetry collection
  - Data processing/filtering before export
  - Production-ready pattern

### Elasticsearch (Optional)
- Stores cached weather data with 1-hour TTL
- Demonstrates distributed tracing: Browser → Backend → Elasticsearch
- Shows cache-first pattern with observability


## 4. Viewing the Demo

Open your browser to **http://localhost:1234** and interact with the UI elements:

- **Manual Span Creation** - Click the button to create custom spans
- **API Simulation** - Trigger cascading HTTP requests to JSONPlaceholder
- **Slider** - Adjust to generate user interaction spans with rich attributes (delta, direction, magnitude)
- **Weather API** - Fetch weather data with full distributed tracing:
  1. Check cache via backend
  2. Fetch from Weather API (if cache miss)
  3. Write to cache via backend
  4. See the complete trace: Browser → Backend → Elasticsearch

The **telemetry log panel** on the right shows real-time trace and span information. You can also check the browser DevTools Network tab to see traces being sent to the collector.

In **Elastic APM**, view:
- **Service Map**: See `vanilla-frontend` → `weather-api-backend` → `elasticsearch` connected
- **Traces**: Click into a `getWeather` transaction to see the full waterfall from click to database call


## 5. Key Concepts Demonstrated

### Hybrid Instrumentation (Automatic + Manual)
The project showcases the **recommended production pattern** of combining automatic and manual instrumentation:

**Automatic Instrumentation:**
- Fetch API calls (via `@opentelemetry/instrumentation-fetch`)
- User interactions: clicks (via `@opentelemetry/instrumentation-user-interaction`)
- Document load events
- FastAPI HTTP requests (backend)

**Manual Instrumentation:**
- Custom span creation with `tracer.startSpan()`
- Parent-child span relationships using `context.with()`
- Custom attributes for business logic (cache operations, slider values)
- Span enrichment via `applyCustomAttributesOnSpan`

**Example**: The weather fetch demonstrates hybrid tracing:
```javascript
// Manual parent span
const parentSpan = tracer.startSpan('getWeather');

// Automatic child span from fetch instrumentation
const response = await fetch(weatherEndpoint);

// Manual cache operation spans
await checkWeatherCache(cityKey);
```

### Distributed Tracing with W3C Trace Context
The `propagateTraceHeaderCorsUrls` configuration in `telemetry.js` enables distributed tracing:
```javascript
'@opentelemetry/instrumentation-fetch': {
  propagateTraceHeaderCorsUrls: [/localhost:8000/]
}
```

This sends `traceparent` headers to the backend, connecting frontend and backend spans in a single trace.

### BatchSpanProcessor for Production
Using `BatchSpanProcessor` instead of `SimpleSpanProcessor` prevents queue overflow:
- Batches spans every 1 second
- Max batch size: 512 spans
- Max queue size: 2048 spans

All spans are visible in Elastic Observability UI under the `vanilla-frontend` and `weather-api-backend` service names.



## License
[Apache 2.0](LICENSE)


Feel free to fork, explore, and extend!

