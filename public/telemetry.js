// Import the custom method overriding automatic span generation
import { automaticSpanMethod } from './otelMethods.js';

// Import the WebTracerProvider, which is the core provider for browser-based tracing
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';

// Used to auto-register built-in instrumentations like page load and user interaction
import { registerInstrumentations } from '@opentelemetry/instrumentation';

// Automatically creates spans for user interactions like clicks
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';

// Import the auto-instrumentations for web, which includes common libraries, frameworks and document load
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';

// Document Load Instrumentation automatically creates spans for document load events
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';

// This context manager ensures span context is maintained across async boundaries in the browser
import { ZoneContextManager } from '@opentelemetry/context-zone';

/* Packages for exporting traces */
// BatchSpanProcessor batches spans together before sending (better for production)
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

// Import the OTLP HTTP exporter for sending traces to the collector over HTTP
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Defines a Resource to include metadata like service.name, required by Elastic
import { Resource } from '@opentelemetry/resources';

// Provides standard semantic keys for attributes, like service.name
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Propagators for distributed tracing (sends trace context to backend)
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { CompositePropagator } from '@opentelemetry/core';


export function initTelemetry() {
  const provider = new WebTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'vanilla-frontend',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'development',
    }),
  });

  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:4318/v1/traces',
      }),
      {
        // Batch config to prevent overwhelming the collector
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 1000, // Send every 1 second
      }
    )
  );

  // Register with context manager AND propagator for distributed tracing
  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator()],
    }),
  });

  // Custom method to rename click spans based on element
  const customizeClickSpan = (span, element) => {
    // Update span name based on which element was clicked
    if (element.id === 'getWeather') {
      span.updateName('weather-button-click');
      span.setAttribute('button.type', 'weather-api');
      span.setAttribute('button.label', element.textContent);
    } else if (element.id === 'button1') {
      span.updateName('manual-span-button-click');
      span.setAttribute('button.type', 'manual-instrumentation');
      span.setAttribute('button.label', element.textContent);
    } else if (element.id === 'button2') {
      span.updateName('api-simulation-button-click');
      span.setAttribute('button.type', 'api-cascade');
      span.setAttribute('button.label', element.textContent);
    } else if (element.id === 'clearLogs') {
      span.updateName('clear-logs-button-click');
      span.setAttribute('button.type', 'utility');
    }
  };

  const autoInstSettings = {
    '@opentelemetry/instrumentation-fetch': {
      applyCustomAttributesOnSpan: automaticSpanMethod,
      // Propagate trace headers to backend (required for distributed tracing)
      propagateTraceHeaderCorsUrls: [
        /localhost:8000/,  // Backend service
        /http:\/\/localhost:8000\/.*/,  // Regex pattern for backend
      ]
    },
    '@opentelemetry/instrumentation-user-interaction': {
      "events": ['click'],
      applyCustomAttributesOnSpan: customizeClickSpan
    },
  }

  registerInstrumentations({
    instrumentations: [
      new getWebAutoInstrumentations(autoInstSettings),
    ],
  });



  console.log('OpenTelemetry frontend initialized');
}
