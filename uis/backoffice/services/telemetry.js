/**
 * HealthCore Telemetry Capture Service
 *
 * Single point of entry for all frontend telemetry events.
 *
 * Architecture (three mechanisms working together):
 *   1. Local queue + batch — events accumulate in memory and are flushed
 *      every FLUSH_INTERVAL_MS or when MAX_QUEUE_SIZE is reached.
 *   2. Reliable flush via `navigator.sendBeacon` — on tab close / navigate away.
 *   3. Retry with exponential backoff — up to MAX_RETRIES attempts, then discard.
 *
 * Usage (plain JS):
 *   import { track } from './services/telemetry.js'
 *   track('incident_created', { severity: 'high', area: 'technology' })
 *
 * Usage (React / TS):
 *   import { track } from '../services/telemetry'
 *   track('section_viewed', { section: 'inventory' })
 *
 * The caller only passes event_type and properties. Everything else
 * (eventId, timestamp, sessionId, userId, schemaVersion, requestId) is
 * auto-enriched by this service.
 */

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const SCHEMA_VERSION = '1.0.0';
const FLUSH_INTERVAL_MS = 10_000;      // 10 seconds
const MAX_QUEUE_SIZE = 20;             // flush when queue reaches 20
const MAX_RETRIES = 3;                 // discard after 3 failed attempts
const RETRY_BASE_DELAY_MS = 1_000;     // initial backoff delay

/* ------------------------------------------------------------------ */
/*  Internal queue & helpers                                           */
/* ------------------------------------------------------------------ */

let queue = [];
let flushTimer = null;
let retryCount = {};
let batchId = 0;

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getSessionId() {
  // Stable per-browser-session identifier
  let sid = sessionStorage.getItem('hc_telemetry_session');
  if (!sid) {
    sid = generateId();
    sessionStorage.setItem('hc_telemetry_session', sid);
  }
  return sid;
}

function getUserId() {
  // Placeholder — will be replaced once auth is in place.
  return 'anonymous';
}

function getRequestId() {
  return generateId();
}

let cachedApiUrl = null;

function getTelemetryEndpoint() {
  // Lazy-resolve to avoid import-order issues.
  if (cachedApiUrl) return cachedApiUrl;
  const base = typeof process !== 'undefined' && process.env
    ? (process.env.NEXT_PUBLIC_TELEMETRY_ENDPOINT || 'http://localhost:8000')
    : window.location.hostname.endsWith('.github.dev')
      ? `${window.location.protocol}//${window.location.hostname.replace(/-\d+(?=\.)/, '-8000')}`
      : 'http://localhost:8000';
  cachedApiUrl = `${base}/telemetry/events`;
  return cachedApiUrl;
}

/* ------------------------------------------------------------------ */
/*  Core track function                                                */
/* ------------------------------------------------------------------ */

/**
 * Enqueue a telemetry event.
 *
 * @param {string} eventType  - Event type in entity_action taxonomy.
 * @param {object} properties - Event-specific properties from the allowlist.
 */
export function track(eventType, properties = {}) {
  const event = {
    eventId: generateId(),
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    userId: getUserId(),
    event_type: eventType,
    schemaVersion: SCHEMA_VERSION,
    requestId: getRequestId(),
    properties,
  };

  queue.push(event);

  // Flush immediately if queue is full
  if (queue.length >= MAX_QUEUE_SIZE) {
    flushNow();
    return;
  }

  // Schedule flush if not already scheduled
  if (!flushTimer) {
    flushTimer = setTimeout(flushNow, FLUSH_INTERVAL_MS);
  }
}

/* ------------------------------------------------------------------ */
/*  Flush & send                                                       */
/* ------------------------------------------------------------------ */

async function postBatch(events) {
  const endpoint = getTelemetryEndpoint();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!response.ok) {
      throw new Error(`Telemetry flush rejected: ${response.status}`);
    }
    return true;
  } catch (err) {
    console.log('Telemetry flush failed:', err.message);
    return false;
  }
}

export function flushNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const batch = queue.splice(0);
  const id = ++batchId;
  retryCount[id] = 0;

  attemptFlush(id, batch);
}

async function attemptFlush(id, events) {
  const success = await postBatch(events);
  if (success) {
    delete retryCount[id];
    return;
  }

  retryCount[id] = (retryCount[id] || 0) + 1;
  if (retryCount[id] > MAX_RETRIES) {
    console.log('Telemetry batch discarded after', MAX_RETRIES, 'failed attempts');
    delete retryCount[id];
    return;
  }

  // Exponential backoff: 1s, 2s, 4s
  const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount[id] - 1);
  setTimeout(() => attemptFlush(id, events), delay);
}

/* ------------------------------------------------------------------ */
/*  Page unload handler (sendBeacon)                                    */
/* ------------------------------------------------------------------ */

function getBeaconUrl() {
  // sendBeacon requires a full URL; re-parse from cached endpoint
  const ep = getTelemetryEndpoint();
  // If we're running on the real api server, use it directly
  return ep;
}

export function handlePageHide() {
  if (queue.length === 0) return;
  const batch = queue.splice(0);
  const endpoint = getTelemetryEndpoint();
  try {
    const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' });
    navigator.sendBeacon(endpoint, blob);
  } catch (_) {
    // sendBeacon failed silently — nothing we can do at this point.
  }
}

/* ------------------------------------------------------------------ */
/*  Auto-register unload handlers                                       */
/* ------------------------------------------------------------------ */

if (typeof window !== 'undefined') {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handlePageHide();
    });
  }
  window.addEventListener('beforeunload', () => handlePageHide());
}