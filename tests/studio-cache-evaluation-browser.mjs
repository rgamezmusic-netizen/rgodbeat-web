// Phase C laboratory, LOCAL ONLY. The experimental worker is served by this
// proxy, never by Next/public or the shipped application. No production account,
// real cloud requests, OS installation or physical-device benchmark is involved.
// Run against `next start` with STUDIO_PLAYWRIGHT_PATH and optionally
// STUDIO_CACHE_REPORT=/absolute/path/outside/repo.json. No Playwright routing:
// routing disables the HTTP cache and would invalidate this comparison.
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const upstream = new URL(process.env.STUDIO_TEST_URL ?? 'http://127.0.0.1:3104');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(upstream.hostname));
assert.equal(upstream.protocol, 'http:');
assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const { chromium } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const prefix = 'rgodbeat-phase-c-lab-';
const cacheName = prefix + 'immutable';
let workerVersion = 1;
const requests = [];
// A deliberately narrow candidate. No navigation/HTML/RSC/font/image/audio,
// API, authorization, Range, private response or Worklet cache. No install-time
// precache, skipWaiting, clients.claim, client messages or page reload code.
function workerSource(version) {
  return `const VERSION=${version}, CACHE=${JSON.stringify(cacheName)};
    self.addEventListener('fetch', event => {
      const r=event.request, u=new URL(r.url);
      if(r.method!=='GET'||u.origin!==self.location.origin||u.search||
        !/^\\/_next\\/static\\/(?:chunks|css)\\/(?:[^/]+\\/)*[^/]*[a-f0-9]{8,}[^/]*\\.(?:js|css)$/.test(u.pathname)||
        !['script','style'].includes(r.destination)||r.headers.has('authorization')||r.headers.has('range')) return;
      event.respondWith((async()=>{
        const cache=await caches.open(CACHE), hit=await cache.match(r);
        if(hit)return hit;
        const response=await fetch(r), control=response.headers.get('cache-control')||'';
        if(response.status===200&&response.type==='basic'&&/immutable/i.test(control)&&
          !/private|no-store/i.test(control)&&/^(?:accept-encoding)?$/i.test(response.headers.get('vary')||'')) {
          await cache.put(r,response.clone());
        }
        return response;
      })());
    });`;
}
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://fixture.invalid').pathname;
  const item = { path, method: req.method, bytes: 0, status: 0, control: '' };
  requests.push(item);
  const send = (status, headers, body) => {
    item.status = status; item.bytes = Buffer.byteLength(body); item.control = headers['cache-control'] ?? '';
    res.writeHead(status, headers); res.end(body);
  };
  if (path === '/studio/cache-evaluation-sw.js') return send(200, {
    'content-type': 'application/javascript', 'cache-control': 'no-store', 'service-worker-allowed': '/studio',
  }, workerSource(workerVersion));
  if (path === '/studio/cache-evaluation-fixture') return send(200, {
    'content-type': 'text/html', 'cache-control': 'no-store',
  }, '<!doctype html><title>Local cache laboratory</title>');
  if (path === '/studio/cache-evaluation-worklet.js') return send(200, {
    'content-type': 'application/javascript', 'cache-control': 'no-store',
  }, `// Synthetic unversioned worklet fixture ${workerVersion}`);
  if (path === '/_next/static/chunks/phasec-f1a2b3c4.js') return send(200, {
    'content-type': 'application/javascript', 'cache-control': 'private, no-store, immutable',
  }, '// Private response must never be cached, even on an allowed script URL');
  if (path.startsWith('/api/')) return send(path === '/api/studio/access' ? 200 : 403, {
    'content-type': 'application/json', 'cache-control': 'private, no-store',
  }, JSON.stringify(path === '/api/studio/access'
    ? { isDemo: true, isLoggedIn: false, hasActivePass: false, email: null, daysRemaining: 0 }
    : { error: 'Local laboratory blocks cloud/API calls' }));
  const proxied = request(new URL(req.url, upstream), {
    method: req.method, headers: { ...req.headers, host: upstream.host },
  }, response => {
    item.status = response.statusCode;
    item.control = response.headers['cache-control'] ?? '';
    // Prevent optional external connections in this disposable browser fixture.
    res.writeHead(response.statusCode, { ...response.headers, 'content-security-policy': "connect-src 'self' blob:;" });
    response.on('data', chunk => { item.bytes += chunk.length; });
    response.pipe(res);
  });
  proxied.on('error', error => { res.writeHead(502); res.end(error.message); });
  req.pipe(proxied);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.STUDIO_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'],
  });
} catch (error) {
  await new Promise(resolve => server.close(resolve));
  throw error;
}
const report = { environment: { browser: browser.version(), upstream: upstream.origin,
  samples: 5, network: 'Unthrottled localhost HTTP proxy; isolated guest access; no external connections',
  storage: 'Only disposable browser-context IDB/localStorage reset between loads; HTTP cache retained',
  candidate: 'Test-only cache-first immutable JS/CSS; never shipped or registered by Studio' }, measurements: [], checks: [] };
const immutable = row => row.path.startsWith('/_next/static/') && /\.(js|css)$/.test(row.path) && row.control.includes('immutable');
async function resetProject(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'indexeddb,local_storage' });
  await cdp.detach();
}
async function measure(context, label, sample) {
  const page = await context.newPage();
  await resetProject(context, page);
  const start = requests.length;
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/studio', { waitUntil: 'domcontentloaded' });
  await page.getByText('Midnight 808', { exact: true }).first().waitFor();
  const readyMs = await page.evaluate(() => performance.now());
  await page.waitForTimeout(300);
  const data = await page.evaluate(async () => ({
    domContentLoadedMs: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
    resources: performance.getEntriesByType('resource').filter(r => /\/_next\/static\/.*\.(js|css)$/.test(r.name))
      .map(r => ({ path: new URL(r.name).pathname, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize })),
    cacheNames: await caches.keys(), controlled: !!navigator.serviceWorker.controller,
    storageEstimate: await navigator.storage.estimate(),
  }));
  assert.deepEqual(errors, []);
  assert.equal(data.controlled, label.startsWith('worker-'));
  if (label.startsWith('http-')) assert.deepEqual(data.cacheNames, []);
  const rows = requests.slice(start).filter(immutable);
  report.measurements.push({ label, sample, readyMs, ...data,
    immutableNetworkRequests: rows.length, immutableNetworkBodyBytes: rows.reduce((sum, row) => sum + row.bytes, 0) });
  await page.close();
}
try {
  for (let sample = 1; sample <= 5; sample++) {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('rgodbeat_install_guide_hidden_v2', 'true'));
    try {
      await measure(context, 'http-cold', sample);
      await measure(context, 'http-warm', sample);
      const fixture = await context.newPage();
      await fixture.goto(base + '/studio/cache-evaluation-fixture');
      await fixture.evaluate(async () => { await navigator.serviceWorker.register('/studio/cache-evaluation-sw.js', { scope: '/studio' }); await navigator.serviceWorker.ready; });
      await fixture.close();
      await measure(context, 'worker-fill-from-warm-http', sample);
      await measure(context, 'worker-warm', sample);
      const inspection = await context.newPage(); await inspection.goto(base + '/studio/cache-evaluation-fixture');
      const cache = await inspection.evaluate(async name => {
        const c = await caches.open(name), keys = await c.keys(); let bytes = 0;
        for (const key of keys) bytes += (await (await c.match(key)).arrayBuffer()).byteLength;
        return { entries: keys.map(k => new URL(k.url).pathname), decodedBodyBytes: bytes,
          storageEstimate: await navigator.storage.estimate() };
      }, cacheName);
      assert.ok(cache.entries.length > 0, 'candidate must really cache code for a valid comparison');
      assert.ok(cache.entries.every(path => path.startsWith('/_next/static/') && /\.(js|css)$/.test(path)));
      report.measurements.push({ label: 'duplicate-cache-storage', sample, ...cache });
      await inspection.close();
    } finally { await context.close(); }
    console.log(`PASS cache measurement sample ${sample}/5`);
  }
  // Explicit network-only exclusions on a controlled page, including Range and
  // Authorization requests to an otherwise cacheable code URL.
  const context = await browser.newContext();
  try {
    const a = await context.newPage(); await a.goto(base + '/studio/cache-evaluation-fixture');
    await a.evaluate(async () => { await navigator.serviceWorker.register('/studio/cache-evaluation-sw.js', { scope: '/studio' }); await navigator.serviceWorker.ready; });
    await a.reload();
    assert.ok(await a.evaluate(() => !!navigator.serviceWorker.controller));
    const exclusions = ['/api/studio/access', '/api/studio/project/audio', '/api/studio/youtube/status',
      '/manifest.json', '/studio/pcm-recorder.js', '/unavailable-fixture.wav'];
    const before = requests.length;
    await a.evaluate(async paths => { for (const path of paths) await fetch(path).then(r => r.arrayBuffer()); }, exclusions);
    for (const path of exclusions) assert.ok(requests.slice(before).some(r => r.path === path), `${path} must reach the server`);
    const asset = report.measurements.find(m => m.label === 'duplicate-cache-storage').entries[0];
    await a.evaluate(async path => {
      await fetch(path, { headers: { Authorization: 'Bearer LOCAL-FAKE-NOT-A-TOKEN' } });
      await fetch(path, { headers: { Range: 'bytes=0-10' } });
      await fetch(path + '?fixture=private');
      await fetch(path, { method: 'POST' });
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/_next/static/chunks/phasec-f1a2b3c4.js';
        script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
    }, asset);
    assert.deepEqual(await a.evaluate(async name => (await (await caches.open(name)).keys()).map(k => k.url), cacheName), []);
    report.checks.push('APIs, private audio/project/YouTube URLs, manifest, Worklet, audio, Authorization, Range, query and POST bypass candidate cache; private/no-store actual script response not cached');
    // Version 2 must wait for BOTH existing clients. No messages/UI are invented
    // to assert that recording/export/upload states have been coordinated.
    const b = await context.newPage(); await b.goto(base + '/studio/cache-evaluation-fixture');
    assert.match(await a.evaluate(async () => (await fetch('/studio/cache-evaluation-worklet.js')).text()), /fixture 1$/);
    workerVersion = 2;
    await a.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await a.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
    assert.match(await a.evaluate(async () => (await fetch('/studio/cache-evaluation-worklet.js')).text()), /fixture 2$/);
    report.checks.push('Synthetic two-version fixture: waiting worker does not pin an unversioned network-only Worklet; old page receives version 2. No real DSP incompatibility is asserted');
    await b.reload();
    assert.equal(await a.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state), 'installed');
    await a.close();
    assert.equal(await b.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state), 'installed');
    await b.close();
    const retirement = await context.newPage(); await retirement.goto(base + '/studio/cache-evaluation-fixture');
    await retirement.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).waiting);
    report.checks.push('Updated candidate waits while either old client remains; reload of one client does not activate it; no forced reload');
    // Retire only the fixture registration/cache. Seeded IndexedDB project and a
    // different cache namespace must survive. This is NOT real user data.
    await retirement.evaluate(async ({ prefix, name }) => {
      await new Promise((resolve, reject) => {
        const r = indexedDB.open('phase-c-fixture-project', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('projects');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => { const db = r.result, tx = db.transaction('projects', 'readwrite');
          tx.objectStore('projects').put('fixture-audio', 'saved');
          tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
      });
      await caches.open('unrelated-fixture-cache');
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        if (registration.active?.scriptURL === location.origin + '/studio/cache-evaluation-sw.js') await registration.unregister();
      }
      for (const key of await caches.keys()) if (key.startsWith(prefix)) await caches.delete(key);
      if ((await caches.keys()).includes(name)) throw Error('Retirement failed');
    }, { prefix, name: cacheName });
    await retirement.close();
    const verify = await context.newPage(); await verify.goto(base + '/studio/cache-evaluation-fixture');
    assert.deepEqual(await verify.evaluate(async () => ({ registrations: (await navigator.serviceWorker.getRegistrations()).length,
      controlled: !!navigator.serviceWorker.controller, caches: await caches.keys(),
      project: await new Promise((resolve, reject) => { const r = indexedDB.open('phase-c-fixture-project'); r.onerror = () => reject(r.error);
        r.onsuccess = () => { const db = r.result, tx = db.transaction('projects'), read = tx.objectStore('projects').get('saved');
          read.onsuccess = () => resolve(read.result); tx.oncomplete = () => db.close(); }; }) })),
      { registrations: 0, controlled: false, caches: ['unrelated-fixture-cache'], project: 'fixture-audio' });
    report.checks.push('Fixture retirement preserves seeded IndexedDB project and unrelated cache; new client is uncontrolled');
  } finally { await context.close(); }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.summary = Object.fromEntries(['http-cold', 'http-warm', 'worker-fill-from-warm-http', 'worker-warm'].map(label => {
    const rows = report.measurements.filter(row => row.label === label);
    return [label, Object.fromEntries(['readyMs', 'domContentLoadedMs', 'immutableNetworkRequests', 'immutableNetworkBodyBytes']
      .map(key => [key, median(rows.map(row => row[key]))]))];
  }));
  report.duplicateCacheBytes = median(report.measurements.filter(row => row.label === 'duplicate-cache-storage').map(row => row.decodedBodyBytes));
  console.log(JSON.stringify({ summary: report.summary, duplicateCacheBytes: report.duplicateCacheBytes, checks: report.checks }, null, 2));
  if (process.env.STUDIO_CACHE_REPORT) await writeFile(process.env.STUDIO_CACHE_REPORT, JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
