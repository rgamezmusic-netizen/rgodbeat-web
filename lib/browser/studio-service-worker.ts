const CACHE_PREFIX = 'rgodbeat-studio-ui-';

/** No skipWaiting, clients.claim or reload: normal browser lifecycle coordinates windows. */
export async function configureStudioServiceWorker(enabled: boolean) {
  if (typeof window === 'undefined' || !window.isSecureContext || !('serviceWorker' in navigator)) return;
  if (enabled) {
    return navigator.serviceWorker.register('/sw.js', { scope: '/studio', updateViaCache: 'none' });
  }

  // Rollback only our worker/cache. IndexedDB, OPFS and all user projects remain untouched.
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    const scope = new URL(registration.scope);
    const workers = [registration.active, registration.waiting, registration.installing];
    if (scope.origin !== window.location.origin || !['/studio', '/studio/'].includes(scope.pathname)) continue;
    if (!workers.some(worker => worker && new URL(worker.scriptURL).origin === scope.origin
      && new URL(worker.scriptURL).pathname === '/sw.js')) continue;
    registration.active?.postMessage({ type: 'RGODBEAT_RETIRE_UI_CACHE' });
    await registration.unregister();
  }
  if ('caches' in window) for (const key of await caches.keys()) {
    if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
  }
}
