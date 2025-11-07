/**
 * OpenTelemetry Frontend Demo Application
 *
 * This file demonstrates various OpenTelemetry instrumentation patterns:
 * - Automatic instrumentation (fetch, XMLHttpRequest)
 * - Manual span creation with custom attributes
 * - Distributed tracing (browser → backend → Elasticsearch)
 * - Cache-first pattern with observability
 * - User interaction tracking (clicks, slider)
 * - Parent-child span relationships
 */

// OpenTelemetry imports
import { context, trace } from '@opentelemetry/api';
import { initTelemetry } from './telemetry.js';

// UI utilities
import { log, logToUI, initLogPanel } from './utility.js';

initTelemetry();
initLogPanel();

const tracer = trace.getTracer('vanilla-frontend');
const weatherApiKey = process.env.WEATHER_API_KEY;

// Backend URL for caching
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

// Cache utility functions with instrumentation
const checkWeatherCache = async (cityKey) => {
  const span = tracer.startSpan('cache.check.backend');

  return await context.with(trace.setSpan(context.active(), span), async () => {
    span.setAttribute('cache.operation', 'read');
    span.setAttribute('cache.key', cityKey);
    span.setAttribute('cache.backend', 'fastapi');

    try {
      const url = `${backendUrl}/api/cache/check?city=${encodeURIComponent(cityKey)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();

        span.setAttribute('cache.hit', result.cached);

        if (result.cached) {
          span.setAttribute('cache.age_seconds', result.age_seconds);
          log(`Cache hit for ${cityKey}`, 'success', { 'Age': `${result.age_seconds}s` });
          span.end();
          return result.data;
        } else {
          span.setAttribute('cache.miss_reason', result.reason || 'unknown');
          log(`Cache miss for ${cityKey}`, 'info', { 'Reason': result.reason || 'unknown' });
          span.end();
          return null;
        }
      } else {
        span.setAttribute('cache.hit', false);
        span.setAttribute('cache.miss_reason', 'backend_error');
        log(`Cache backend error for ${cityKey}`, 'error', { 'Status': response.status });
        span.end();
        return null;
      }
    } catch (error) {
      span.setAttribute('cache.hit', false);
      span.setAttribute('cache.error', error.message);
      span.recordException(error);
      span.end();
      log('Cache check error', 'error', { 'Error': error.message });
      return null;
    }
  });
};

const cacheWeatherData = async (cityKey, weatherData) => {
  const span = tracer.startSpan('cache.write.backend');

  return await context.with(trace.setSpan(context.active(), span), async () => {
    span.setAttribute('cache.operation', 'write');
    span.setAttribute('cache.key', cityKey);
    span.setAttribute('cache.backend', 'fastapi');

    try {
      const url = `${backendUrl}/api/cache/write`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          city: cityKey,
          weather_data: weatherData
        })
      });

      if (response.ok) {
        span.setAttribute('cache.write.success', true);
        log(`Cached weather data for ${cityKey}`, 'success');
      } else {
        span.setAttribute('cache.write.success', false);
        span.setAttribute('cache.write.status', response.status);
        log('Cache write failed', 'error', { 'Status': response.status, 'City': cityKey });
      }

      span.end();
    } catch (error) {
      span.setAttribute('cache.write.success', false);
      span.setAttribute('cache.error', error.message);
      span.recordException(error);
      span.end();
      log('Cache write error', 'error', { 'Error': error.message, 'City': cityKey });
    }
  });
};

const getDataCascade = () => {
  // Log the cascade start
  const activeSpan = trace.getSpan(context.active());
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    logToUI('API Cascade Started', spanContext, 'fetch', {
      'Requests': '3 cascading requests',
      'Endpoint': 'jsonplaceholder.typicode.com',
      'Type': 'XMLHttpRequest + Fetch'
    });
  }

  getData1('https://jsonplaceholder.typicode.com/posts/1').then(() => {
    getData2('https://jsonplaceholder.typicode.com/users/1').then(() => {
      log('API cascade: request 2 completed', 'info', { 'Endpoint': 'users/1' });
    });
    getData1('https://jsonplaceholder.typicode.com/todos/1').then(() => {
      log('API cascade: request 3 completed', 'info', { 'Endpoint': 'todos/1' });
    });
    log('API cascade: request 1 completed', 'info', { 'Endpoint': 'posts/1' });
  });
}

// Example using XMLHttpRequest instead of fetch
const getData1 = (url) => {
  return new Promise(async (resolve) => {
    const req = new XMLHttpRequest();
    req.open('GET', url, true);
    req.setRequestHeader('Content-Type', 'application/json');
    req.setRequestHeader('Accept', 'application/json');
    req.send();
    req.onload = function () {
      resolve();
    };
  });
}

const getData2 = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    return response;
  } catch (error) {
    log('Error in getData2', 'error', { 'Error': error.message, 'URL': url });
  }
}

// Manual span emitter tool for debugging
const emitSpan = (action, value) => {
  const parent = trace.getSpan(context.active());
  const span = tracer.startSpan(action, {
    parent: parent?.spanContext(), // this helps propagate parent trace
  });

  // Run the span within the active context
  context.with(trace.setSpan(context.active(), span), () => {
    span.setAttribute('action', action);
    if (value !== undefined) {
      span.setAttribute('value', value);
    }

    // Log to UI
    const spanContext = span.spanContext();
    logToUI(action, spanContext, 'manual', {
      'Action': action,
      'Value': value || 'N/A',
      'Status': 'Batched (sent every 1s)'
    });

    subFunction(action);
    span.end();
  });
};

const subFunction = (action) => {
  const tracer = trace.getTracer('vanilla-frontend');
  const span = tracer.startSpan(`${action}.subfunction.emitSpan`);

  // Optional: run in context if you have async work
  context.with(trace.setSpan(context.active(), span), () => {
    span.setAttribute('sub.key', 'subvalue');
    span.setAttribute('result', 1);

    // Log to UI
    const spanContext = span.spanContext();
    logToUI(`${action}.subfunction`, spanContext, 'manual', {
      'Parent Action': action,
      'Result': '1',
      'Type': 'Child span'
    });

    span.end();
  });
  // this return value will show up in the span as a result numeric_label type
  return 1;
}

const renderWeather = (data) => {
  const weatherContainer = document.querySelector('#weather');

  const { location, current } = data;
  const { name, region, country }  = location;
  const { temp_f, condition } = current;

  weatherContainer.innerHTML = `
    <h2>${name}, ${region}, ${country}</h2>
    <p>Temperature: ${temp_f}°F</p>
    <p>Conditions: ${condition.text}</p>`

  weatherContainer.style.display = 'block';

  return weatherContainer;
}

const getWeather = async (input) => {
  const cityKey = input || '98366';
  const parentSpan = tracer.startSpan('getWeather');

  return await context.with(trace.setSpan(context.active(), parentSpan), async () => {
    parentSpan.setAttribute('weather.city', cityKey);
    parentSpan.setAttribute('weather.has_cache', true);

    try {
      // Step 1: Check cache via backend
      let weatherData = null;
      let cacheHit = false;

      weatherData = await checkWeatherCache(cityKey);
      cacheHit = !!weatherData;
      parentSpan.setAttribute('cache.used', true);
      parentSpan.setAttribute('cache.hit', cacheHit);

      // Step 2: If cache miss, fetch from API
      if (!weatherData) {
        const weatherEndpoint = `https://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${cityKey}&aqi=yes`;

        logToUI('Weather API Fetch', parentSpan.spanContext(), 'fetch', {
          'URL': weatherEndpoint.split('?')[0],
          'City': cityKey,
          'Cache': cacheHit ? 'Hit' : 'Miss',
          'Method': 'GET'
        });

        const response = await fetch(weatherEndpoint);
        const cloneForApp = response.clone();
        weatherData = await cloneForApp.json();

        parentSpan.setAttribute('weather.api_called', true);

        // Step 3: Store in cache via backend
        await cacheWeatherData(cityKey, weatherData);
        parentSpan.setAttribute('cache.wrote', true);
      } else {
        parentSpan.setAttribute('weather.api_called', false);
        parentSpan.setAttribute('weather.source', 'cache');

        logToUI('Weather Cache Hit', parentSpan.spanContext(), 'fetch', {
          'City': cityKey,
          'Source': 'Backend Cache',
          'API Call': 'Skipped'
        });
      }

      // Render the weather data
      renderWeather(weatherData);

      parentSpan.end();
      return weatherData;
    } catch (e) {
      parentSpan.recordException(e);
      parentSpan.setAttribute('error', true);
      parentSpan.end();
      log('Error fetching weather data', 'error', { 'Error': e.message });
    }
  });
}
  
document.querySelector('#getWeather').addEventListener('click', () => {
  const input = document.querySelector('#weatherInput').value;
  getWeather(input)
});

document.querySelector('#button1').addEventListener('click', () => {
  emitSpan('user.clicked.#button1', '#button1');
});

// Track slider interaction with start and end values
let sliderTimeout;
let sliderStartValue = null;

// Capture initial value when interaction starts
document.querySelector('#slider').addEventListener('mousedown', (e) => {
  sliderStartValue = e.target.value;
});

document.querySelector('#slider').addEventListener('touchstart', (e) => {
  sliderStartValue = e.target.value;
});

// Create span with rich attributes when interaction completes
document.querySelector('#slider').addEventListener('change', (e) => {
  const endValue = parseInt(e.target.value);
  const startValue = parseInt(sliderStartValue || endValue);
  const delta = endValue - startValue;
  const direction = delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'unchanged';

  // Create a span with the slider as the action name
  const span = tracer.startSpan('user.adjusted.slider');

  context.with(trace.setSpan(context.active(), span), () => {
    span.setAttribute('slider.start.value', startValue);
    span.setAttribute('slider.end.value', endValue);
    span.setAttribute('slider.delta', delta);
    span.setAttribute('slider.direction', direction);
    span.setAttribute('slider.magnitude', Math.abs(delta));

    // Add context about the adjustment
    let adjustmentType;
    if (Math.abs(delta) >= 5) {
      adjustmentType = 'large';
      span.setAttribute('slider.adjustment', 'large');
    } else if (Math.abs(delta) >= 2) {
      adjustmentType = 'medium';
      span.setAttribute('slider.adjustment', 'medium');
    } else if (delta !== 0) {
      adjustmentType = 'small';
      span.setAttribute('slider.adjustment', 'small');
    } else {
      adjustmentType = 'none';
      span.setAttribute('slider.adjustment', 'none');
    }

    // Log to UI
    const spanContext = span.spanContext();
    logToUI('user.adjusted.slider', spanContext, 'interaction', {
      'Start': startValue,
      'End': endValue,
      'Delta': delta > 0 ? `+${delta}` : delta,
      'Direction': direction,
      'Adjustment': adjustmentType
    });

    span.end();
  });

  // Reset for next interaction
  sliderStartValue = endValue;
});

// Visual feedback only (no span creation) for input events
document.querySelector('#slider').addEventListener('input', (e) => {
  const value = e.target.value;
  clearTimeout(sliderTimeout);

  // Only log to UI, don't create spans (prevents queue overflow)
  sliderTimeout = setTimeout(() => {
    const startVal = sliderStartValue || value;
    const delta = parseInt(value) - parseInt(startVal);
    logToUI('Slider Dragging', { traceId: 'UI-ONLY', spanId: 'NO-SPAN' }, 'interaction', {
      'Current Value': value,
      'Start Value': startVal,
      'Delta': delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : '0',
      'Note': 'Span created on release'
    });
  }, 300); // Debounce by 300ms
});

document.querySelector('#button2').addEventListener('click', () => {
  getDataCascade()
});
