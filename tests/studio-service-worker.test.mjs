import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/sw.js', 'utf8');
const origin = 'https://studio.example';
const asset = '/_next/static/chunks/app/studio/page-12345678abcdef00.js';
function fixture({ quota = false, privateResponse = false, size = 10 } = {}) {
  const handlers = {}, stores = new Map();
  let fetches = 0, unregistered = false;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(req) { return entries.get(req.url)?.clone(); },
        async put(req, response) { if (quota) throw new DOMException('Full', 'QuotaExceededError'); entries.set(req.url, response.clone()); },
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
        async delete(req) { return entries.delete(req.url); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: { origin },
    registration: { async unregister() { unregistered = true; } },
    addEventListener(name, handler) { handlers[name] = handler; },
    skipWaiting() { throw new Error('Unsafe activation'); },
    clients: { claim() { throw new Error('Unsafe client takeover'); } },
  };
  vm.runInNewContext(source, { self, caches, URL, fetch: async request => {
    fetches++;
    const response = new Response('x'.repeat(size), { headers: {
      'Content-Type': request.url.endsWith('.png') ? 'image/png' : 'application/javascript',
      'Cache-Control': privateResponse ? 'private, no-store' : 'public, max-age=31536000, immutable',
    } });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  } });
  async function request(path, options = {}) {
    const promises = [];
    let result;
    handlers.fetch({ request: new Request(new URL(path, origin), options),
      respondWith(value) { result = value; }, waitUntil(value) { promises.push(value); } });
    const response = result && await result;
    await Promise.all(promises);
    return response;
  }
  async function dispatch(name, data) {
    const promises = [];
    handlers[name]({ data, waitUntil(value) { promises.push(value); } });
    await Promise.all(promises);
  }
  return { request, dispatch, stores, fetches: () => fetches, unregistered: () => unregistered };
}

test('worker caches only immutable static UI, retains hashed versions and bounds entry count', async () => {
  const f = fixture();
  await f.request(asset); await f.request(asset);
  assert.equal(f.fetches(), 1);
  await f.request(asset.replace('12345678abcdef00', 'abcdef0012345678'));
  assert.equal(f.fetches(), 2);
  for (let i = 0; i < 30; i++) await f.request(`/_next/static/chunks/page-${i.toString(16).padStart(16, '0')}.js`);
  assert.equal([...f.stores.values()][0].size, 24);
});

test('HTML, audio, projects, APIs, Worklets, external hosts, queries, Range, auth and POST bypass the worker', async () => {
  const f = fixture();
  for (const [path, options] of [
    ['/studio', {}], ['/api/studio/project', {}], ['/api/studio/youtube/publish', {}],
    ['/song.wav', {}], ['/song.mp3', {}], ['/projects/one.rgodbeat', {}],
    ['/worklets/pitch-processor.js', {}], ['/manifest.json', {}],
    [asset + '?token=private', {}], ['https://remote.example' + asset, {}],
    [asset, { headers: { Range: 'bytes=0-100' } }], [asset, { headers: { Authorization: 'Bearer fixture' } }],
    [asset, { method: 'POST' }], [asset, { cache: 'no-store' }],
    ['/_next/static/chunks/mutable.js', {}],
  ]) assert.equal(await f.request(path, options), undefined, path);
  assert.equal(f.fetches(), 0);
  assert.equal(f.stores.size, 0);
});

test('private responses, oversized assets and exhausted quota never break the network response', async () => {
  for (const options of [{ privateResponse: true }, { size: 512 * 1024 + 1 }, { quota: true }]) {
    const f = fixture(options);
    assert.equal((await f.request(asset)).status, 200);
    assert.equal((await f.request(asset)).status, 200);
    assert.equal(f.fetches(), 2);
    assert.equal([...f.stores.values()][0].size, 0);
  }
});

test('activation and retirement touch only owned UI caches, without takeover, reload or project APIs', async () => {
  const f = fixture();
  f.stores.set('other-application', new Map());
  f.stores.set('rgodbeat-studio-ui-old', new Map());
  await f.request(asset);
  await f.dispatch('activate');
  assert.deepEqual([...f.stores.keys()].sort(), ['other-application', 'rgodbeat-studio-ui-v1']);
  await f.dispatch('message', { type: 'RGODBEAT_RETIRE_UI_CACHE' });
  assert.deepEqual([...f.stores.keys()], ['other-application']);
  assert.equal(f.unregistered(), true);
  assert.equal(await f.request(asset), undefined);
});
