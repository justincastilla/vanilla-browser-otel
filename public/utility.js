/**
 * UI Utility Functions
 *
 * Logging utilities for displaying telemetry data and general messages
 * in the browser's telemetry log panel.
 */

// Log telemetry spans to UI with full trace context
export const logToUI = (spanName, spanContext, type = 'manual', details = {}) => {
  const logOutput = document.querySelector('#logOutput');
  const timestamp = new Date().toISOString();
  const traceId = spanContext?.traceId || 'N/A';
  const spanId = spanContext?.spanId || 'N/A';

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;

  let detailsHTML = '';
  for (const [key, value] of Object.entries(details)) {
    detailsHTML += `<div class="log-detail"><span>${key}:</span> ${value}</div>`;
  }

  logEntry.innerHTML = `
    <div class="log-time">${timestamp}</div>
    <span class="log-type ${type}">${type}</span>
    <div class="log-detail"><span>Span:</span> ${spanName}</div>
    <div class="log-detail"><span>Trace ID:</span> <span class="log-trace-id">${traceId}</span></div>
    <div class="log-detail"><span>Span ID:</span> <span class="log-span-id">${spanId}</span></div>
    ${detailsHTML}
  `;

  // Insert at the top
  logOutput.insertBefore(logEntry, logOutput.firstChild);

  // Auto-scroll to top
  logOutput.scrollTop = 0;
};

// Simple log function for general messages
export const log = (message, type = 'info', details = {}) => {
  const logOutput = document.querySelector('#logOutput');
  const timestamp = new Date().toISOString();

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry`;

  // Set color based on type
  let borderColor = '#4fc3f7'; // info
  let bgColor = '#4fc3f7';
  if (type === 'error') {
    borderColor = '#f44336';
    bgColor = '#f44336';
  } else if (type === 'success') {
    borderColor = '#4caf50';
    bgColor = '#4caf50';
  } else if (type === 'warning') {
    borderColor = '#ff9800';
    bgColor = '#ff9800';
  }

  let detailsHTML = '';
  for (const [key, value] of Object.entries(details)) {
    detailsHTML += `<div class="log-detail"><span>${key}:</span> ${value}</div>`;
  }

  logEntry.innerHTML = `
    <div class="log-time">${timestamp}</div>
    <span class="log-type" style="background: ${bgColor};">${type.toUpperCase()}</span>
    <div class="log-detail">${message}</div>
    ${detailsHTML}
  `;
  logEntry.style.borderLeftColor = borderColor;

  // Insert at the top
  logOutput.insertBefore(logEntry, logOutput.firstChild);

  // Also log to console for debugging
  console.log(`[${type.toUpperCase()}]`, message, details);

  // Auto-scroll to top
  logOutput.scrollTop = 0;
};

// Initialize telemetry log panel
export const initLogPanel = () => {
  document.addEventListener('DOMContentLoaded', () => {
    const logOutput = document.querySelector('#logOutput');

    // Add initial message
    logOutput.innerHTML = `
      <div class="log-entry" style="border-left-color: #4fc3f7;">
        <div class="log-time">${new Date().toISOString()}</div>
        <span class="log-type" style="background: #4fc3f7;">READY</span>
        <div class="log-detail"><span>Status:</span> Telemetry logging initialized</div>
        <div class="log-detail"><span>Info:</span> Interact with the buttons above to see trace data appear here</div>
      </div>
    `;

    // Clear logs button
    document.querySelector('#clearLogs')?.addEventListener('click', () => {
      logOutput.innerHTML = '';
    });
  });
};
