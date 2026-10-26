// Actual worker in an isolated Chrome profile on localhost. No physical device,
// microphone, real user database, remote services or production writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const { chromium } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const worker = await readFile('public/sw.js', 'utf8');
let version = 1;
const counts = new Map();
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  counts.set(path, (counts.get(path) || 0) + 1);
  if (path === '/sw.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Service-Worker-Allowed', '/studio');
    res.end(worker + `\n// Test deployment ${version}\n`);
  } else if (path.startsWith('/_next/static/')) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(`/* fixture asset ${path} */`);
  } else if (path.startsWith('/api/') || path.endsWith('.mp3') || path.startsWith('/worklets/')) {
    res.setHeader('Cache-Control', 'no-store');
    res.end('private or audio fixture');
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end('<!doctype html><title>Worker fixture</title><script>window.controllerChanges=0; navigator.serviceWorker.addEventListener("controllerchange",()=>window.controllerChanges++);</script>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(base + '/studio');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/studio', updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
  });
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null, 'initial install does not seize the running page');
  await page.reload();
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
  const asset = '/_next/static/chunks/page-12345678abcdef00.js';
  for (let i = 0; i < 2; i++) await page.evaluate(path => fetch(path, { cache: 'reload' }).then(r => r.text()), asset);
  assert.equal(counts.get(asset), 1, 'second immutable asset response comes from the UI cache');
  for (const path of ['/api/studio/project', '/audio/beat.mp3', '/worklets/pitch-processor.js']) {
    for (let i = 0; i < 2; i++) await page.evaluate(path => fetch(path, { cache: 'reload' }).then(r => r.text()), path);
    assert.equal(counts.get(path), 2, path + ' always goes to network');
  }
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname)))).flat();
  });
  assert.deepEqual(cached, [asset]);
  console.log('PASS actual Chrome worker: bounded static cache; HTML, APIs, audio and Worklets excluded');

  const second = await context.newPage(); await second.goto(base + '/studio');
  const observer = await context.newPage(); await observer.goto(base + '/');
  await observer.evaluate(async () => { window.oldWorker = (await navigator.serviceWorker.getRegistration('/studio')).active; });
  version = 2;
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.evaluate(() => window.controllerChanges), 0);
  assert.equal(await second.evaluate(() => window.controllerChanges), 0);
  await page.close();
  assert.equal(await second.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), true, 'second Studio window prevents activation');
  await second.close();
  await observer.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/studio');
    return reg?.active?.state === 'activated' && !reg.waiting && window.oldWorker.state === 'redundant';
  });
  console.log('PASS actual Chrome lifecycle: update waits for all Studio windows; no takeover or automatic reload');

  await observer.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('pwa-retirement-fixture', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('recordings');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result, tx = db.transaction('recordings', 'readwrite');
        tx.objectStore('recordings').put('audio-fixture', 'take');
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
    (await navigator.serviceWorker.getRegistration('/studio')).active.postMessage({ type: 'RGODBEAT_RETIRE_UI_CACHE' });
  });
  await observer.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration('/studio')));
  assert.deepEqual(await observer.evaluate(() => caches.keys()), []);
  assert.equal(await observer.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('pwa-retirement-fixture');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, request = db.transaction('recordings').objectStore('recordings').get('take');
      request.onsuccess = () => { db.close(); resolve(request.result); };
    };
  })), 'audio-fixture');
  console.log('PASS actual Chrome retirement: owned UI cache removed, IndexedDB recording fixture preserved');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
