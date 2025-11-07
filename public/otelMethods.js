export const automaticSpanMethod = async (span, request, result) => {

  // Request Section
  try {
    const url = span.attributes['http.url'];

    if (url) {
      // Parse the URL and extract the "q" parameter
      const parsedUrl = new URL(url);
      const queryParam = parsedUrl.searchParams.get('q');

      if (parsedUrl.host == 'api.weatherapi.com') {
        span.updateName('automatic-weather-api');
      } else if (parsedUrl.host == 'jsonplaceholder.typicode.com') {
        span.updateName('automatic-jsonplaceholder-api');
        // Extract resource type from path (posts, users, todos, etc.)
        const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          span.setAttribute('api.resource', pathParts[0]);
          if (pathParts.length > 1) {
            span.setAttribute('api.resourceId', pathParts[1]);
          }
        }
      }

      if (queryParam) {
        span.setAttribute('user.input.queryParameters', queryParam);
      }
    }

  } catch (e) {
    span.setAttribute('user.input.error', e.message);
  }

  // Response Section
  try {
    if (result && result.clone && !result.bodyUsed) {
      const clonedResponse = result.clone();
      const contentType = clonedResponse.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const body = await clonedResponse.json();
        if (body?.location) {
          span.setAttributes({
            'weather.location.name': body.location.name,
            'weather.location.region': body.location.region,
            'weather.location.country': body.location.country,
            'weather.location.temp_f': body.current.temp_f,
          });
        }
      } else if (contentType.includes('text')) {
        const body = await clonedResponse.text();
        span.setAttribute('response.textBody', body.slice(0, 1000));
      } else {
        span.setAttribute('response.body.type', '[non-text response]');
      }
    } else if (result?.bodyUsed) {
      span.setAttribute('response.body.warning', 'Body already used — cannot clone');
    }
  } catch (e) {
    span.setAttribute('response.body.error', e.message);
  }

  span.setAttribute('fromAutoInstrumentation', true);
}
