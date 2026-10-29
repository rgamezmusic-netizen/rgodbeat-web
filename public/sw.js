/* RGODBEAT Studio: bounded UI cache, online HTML and network-only audio/data.
 * Updates wait for every old Studio window to close. Never skipWaiting(),
 * claim existing clients or reload a page from this worker.
 */
'use strict';

const CACHE_PREFIX = 'rgodbeat-studio-ui-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const MAX_ENTRIES = 24;
const MAX_ASSET_BYTES = 512 * 1024; // At most 12 MiB of bodies, plus browser metadata.
const ICONS = new Set(['/icons/icon-192.png', '/icons/icon-512.png', '/apple-touch-icon.png', '/images/rgodbeat-studio-logo.png']);
let writes = Promise.resolve();
let retired = false;

function assetPolicy(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search
    || request.mode === 'navigate' || request.cache === 'no-store'
    || request.headers.has('authorization') || request.headers.has('range')) return null;
  if (url.pathname.startsWith('/api/') || /\.(?:wav|mp3|ogg|m4a|aac|flac|webm|mp4|aiff|opus|wasm)$/i.test(url.pathname)
    || /\/(?:audio|worklets?)\//i.test(url.pathname)) return null;
  // Only content-addressed Next.js scripts/styles; never HTML, RSC, maps,
  // AudioWorklets, signed URLs, remote artwork, projects or user uploads.
  if (/^\/_next\/static\/(?:chunks|css)\/.+\.(?:js|css)$/.test(url.pathname)
    && /(?:^|[-/])[a-f0-9]{8,}\.(?:js|css)$/.test(url.pathname)) return 'immutable';
  return ICONS.has(url.pathname) ? 'image' : null;
}

function cacheable(response, policy) {
  const control = response.headers.get('cache-control') || '';
  const type = response.headers.get('content-type') || '';
  return response.ok && response.type === 'basic' && !response.redirected
    && !/\b(?:private|no-store|no-cache)\b/i.test(control)
    && (policy === 'image' ? /^image\/png\b/i.test(type)
      : /\bimmutable\b/i.test(control) && /^(?:text\/(?:javascript|css)|application\/javascript)\b/i.test(type));
}

function saveAsset(event, cache, request, response) {
  writes = writes.catch(() => {}).then(async () => {
    if (retired || !cache) return;
    const declaredLength = Number(response.headers.get('content-length'));
    if (declaredLength > MAX_ASSET_BYTES) return;
    if (!declaredLength && (await response.clone().arrayBuffer()).byteLength > MAX_ASSET_BYTES) return;
    if (retired) return;
    await cache.put(request, response);
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
  }).catch(() => { /* Quota/private browsing errors must never fail a UI request. */ });
  event.waitUntil(writes);
}

async function loadAsset(event, policy) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  if (cache && policy === 'immutable') {
    const cached = await cache.match(request).catch(() => null);
    if (cached) return cached;
  }
  try {
    const response = await fetch(request);
    if (cacheable(response, policy)) saveAsset(event, cache, request, response.clone());
    return response;
  } catch (error) {
    const cached = cache && await cache.match(request).catch(() => null);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  if (retired) return;
  const policy = assetPolicy(event.request);
  if (policy) event.respondWith(loadAsset(event, policy));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
    .map(key => caches.delete(key)))));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'RGODBEAT_RETIRE_UI_CACHE') return;
  retired = true;
  event.waitUntil(writes.then(async () => {
    for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
    await self.registration.unregister();
  }));
});
