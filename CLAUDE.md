# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a vanilla JavaScript demonstration of OpenTelemetry browser instrumentation with Elastic Observability. The project shows a progression from manual span creation to automatic instrumentation, and finally a hybrid approach combining both techniques.

## Development Commands

### Starting the application
```bash
# Start all services (Frontend and OpenTelemetry Collector)
docker-compose up
```

The application will be available at `http://localhost:1234`

This single command starts:
- Frontend Parcel dev server on port 1234
- OpenTelemetry Collector on port 4318 (with CORS enabled)

### Hot Reloading
The `public/` directory is mounted as a volume, so changes to frontend code will automatically trigger Parcel to rebuild and reload the browser.

### Building
Parcel handles bundling automatically during development. No separate build command is needed for production builds in this demo.

## Architecture

### Simplified Two-Tier Telemetry Pipeline

1. **Browser (Frontend)** - `public/` directory
   - Vanilla JavaScript application instrumented with OpenTelemetry Web SDK
   - Sends telemetry directly to OpenTelemetry Collector on port 4318

2. **OpenTelemetry Collector** - `otel-collector/` directory
   - Receives OTLP data via HTTP on port 4318
   - CORS enabled to accept browser requests from localhost:1234
   - Exports to Elastic APM endpoint (configured via `.env`)

### Key Files

- **public/app.js** - Main application with event handlers and business logic
- **public/telemetry.js** - OpenTelemetry initialization and instrumentation setup
  - Registers `WebTracerProvider` with service name `vanilla-frontend`
  - Uses `BatchSpanProcessor` to batch spans every 1 second (prevents collector queue overflow)
  - Configures `getWebAutoInstrumentations` for automatic fetch/XHR/document load tracing
  - Uses `ZoneContextManager` to maintain context across async operations
- **public/otelMethods.js** - Custom span enrichment via `applyCustomAttributesOnSpan` hook
  - Enhances automatic spans with request/response details
  - Extracts weather API data and JSONPlaceholder API responses
  - Demonstrates hybrid instrumentation (automatic + manual enrichment)
- **public/index.html** - Contains `traceparent` meta tag for trace context propagation

### Instrumentation Strategy

The codebase demonstrates three instrumentation levels:

1. **Manual spans** - `emitSpan()` function creates custom spans with attributes
2. **Automatic instrumentation** - Via `getWebAutoInstrumentations()` for fetch/XHR/user interactions
3. **Hybrid approach** - `automaticSpanMethod()` enriches auto-generated spans with custom attributes

Key configuration in `telemetry.js`:
```javascript
registerInstrumentations({
  instrumentations: [
    new getWebAutoInstrumentations({
      '@opentelemetry/instrumentation-fetch': {
        applyCustomAttributesOnSpan: automaticSpanMethod
      },
      '@opentelemetry/instrumentation-user-interaction': {
        "events": ['click']
      }
    })
  ]
});
```

### Environment Configuration

Required environment variables in `.env`:
- `ELASTIC_ENDPOINT` - Your Elastic APM server URL
- `ELASTIC_TOKEN` - API key for Elastic authentication (format: `ApiKey <your-token>`)
- `WEATHER_API_KEY` - (Used at runtime via Parcel's process.env) For weather API demo

Copy `.env.example` to `.env` and fill in values before running.

**Important**: The `ELASTIC_TOKEN` must be formatted as `ApiKey <your-token>`, not `Bearer <your-token>`.

## OpenTelemetry Concepts

### Context Propagation
The application uses `context.with()` and `trace.setSpan()` to maintain parent-child span relationships, especially important for the nested spans created by `subFunction()` in app.js:72-84.

### Span Attributes
Custom attributes are added via `span.setAttribute()` for debugging and filtering in Elastic APM. The `automaticSpanMethod` shows how to clone Response objects to read bodies without consuming them (otelMethods.js:28-33).

### Service Name
All traces are tagged with `service.name: vanilla-frontend` via SemanticResourceAttributes (telemetry.js:39).

## Docker Services

Both services defined in `docker-compose.yml`:
- `frontend`: Built from `Dockerfile.frontend`, runs Parcel dev server with hot reloading on port 1234
- `otel-collector`: Built from `otel-collector/Dockerfile`, uses config at `otel-collector/otel-collector-config.yaml`, runs on port 4318 with CORS enabled

The frontend service depends on `otel-collector` to ensure proper startup order.

## Common Tasks

### Adding new manual spans
Use the `emitSpan(action, value)` pattern from app.js:54-70. Ensure spans are created within an active context using `context.with()`.

### Modifying automatic instrumentation
Edit the `autoInstSettings` object in telemetry.js:58-65 to configure individual instrumentations.

### Changing trace export destination
Update `ELASTIC_ENDPOINT` and `ELASTIC_TOKEN` in `.env`, and ensure the collector config at `otel-collector/otel-collector-config.yaml` references them correctly.

### Troubleshooting spans
Check browser console for "OpenTelemetry frontend initialized" message and Network tab for POST requests to `localhost:4318/v1/traces`. Note that spans are batched and sent every 1 second, not immediately. Collector logs show debug-level telemetry when running with `docker-compose up`.

## Troubleshooting

### 503 Service Unavailable: "sending queue is full"
If you see this error in the browser console, the OpenTelemetry Collector's queue is overwhelmed. The frontend uses `BatchSpanProcessor` with a 1-second batch interval to prevent this. If it still occurs:
- Check that the collector is running: `docker-compose ps`
- Verify the collector has enough resources
- Reduce span creation frequency in your code
- The batch processor settings are in telemetry.js:52-56

### Authentication Error: "ApiKey prefix not found"
If you see the error `rpc error: code = Unauthenticated desc = ApiKey prefix not found`, check your `.env` file. The `ELASTIC_TOKEN` must be in the format:
```
ELASTIC_TOKEN=ApiKey your-actual-token-here
```
Not:
```
ELASTIC_TOKEN=Bearer your-actual-token-here
```

### Frontend Not Hot Reloading
If changes to `public/` files aren't being picked up, restart the docker containers: `docker-compose restart frontend`
