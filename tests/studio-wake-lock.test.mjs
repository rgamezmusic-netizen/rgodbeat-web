import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { loadSource } from './helpers/rg-fixtures.mjs';

const { maintainScreenWakeLock } = loadSource('lib/browser/screen-wake-lock.ts');
function fixture(requestImpl) {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const window = new EventTarget();
  const sentinels = [];
  let calls = 0;
  const navigator = { wakeLock: { async request(type) {
    assert.equal(type, 'screen'); calls++;
    if (requestImpl) return requestImpl(calls);
    const sentinel = Object.assign(new EventTarget(), { released: false, async release() {
      if (this.released) return;
      this.released = true; this.dispatchEvent(new Event('release'));
    } });
    sentinels.push(sentinel); return sentinel;
  } } };
  return { document, window, navigator, sentinels, get calls() { return calls; } };
}

test('one visible session keeps a single lock through interactions and releases it on exit', async () => {
  const f = fixture(); const dispose = maintainScreenWakeLock(f); await flush();
  for (const event of ['pointerdown', 'keydown']) f.document.dispatchEvent(new Event(event));
  f.window.dispatchEvent(new Event('focus')); await flush();
  assert.equal(f.calls, 1); assert.equal(f.sentinels[0].released, false);
  dispose(); await flush(); assert.equal(f.sentinels[0].released, true);
  f.document.dispatchEvent(new Event('pointerdown')); await flush(); assert.equal(f.calls, 1);
});

test('foreground return and page restore reacquire a lock released while hidden', async () => {
  const f = fixture(); const dispose = maintainScreenWakeLock(f); await flush();
  f.document.visibilityState = 'hidden'; f.document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(f.sentinels[0].released, true);
  f.window.dispatchEvent(new Event('pageshow')); await flush(); assert.equal(f.calls, 1);
  f.document.visibilityState = 'visible'; f.document.dispatchEvent(new Event('visibilitychange')); await flush();
  assert.equal(f.calls, 2); dispose();
});

test('system release retries once without an infinite low-battery loop', async () => {
  const f = fixture(); const dispose = maintainScreenWakeLock(f); await flush();
  await f.sentinels[0].release(); await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(f.calls, 2);
  await f.sentinels[1].release(); await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal(f.calls, 2);
  f.document.dispatchEvent(new Event('pointerdown')); await flush(); assert.equal(f.calls, 3); dispose();
});

test('a denied request can retry on the next gesture without breaking the session', async () => {
  const sentinel = { released: false, addEventListener() {}, async release() { this.released = true; } };
  const f = fixture(async calls => { if (calls === 1) throw new Error('NotAllowedError'); return sentinel; });
  const dispose = maintainScreenWakeLock(f); await flush();
  f.document.dispatchEvent(new Event('pointerdown')); await flush(); assert.equal(f.calls, 2);
  dispose(); assert.equal(sentinel.released, true);
});

test('a pending request resolved after exit immediately releases its lock', async () => {
  let complete;
  const f = fixture(() => new Promise(resolve => { complete = resolve; }));
  const dispose = maintainScreenWakeLock(f);
  f.document.dispatchEvent(new Event('pointerdown')); assert.equal(f.calls, 1);
  dispose();
  const sentinel = { released: false, async release() { this.released = true; } };
  complete(sentinel); await flush(); assert.equal(sentinel.released, true);
});

test('unsupported browsers and initially hidden pages remain usable', async () => {
  const f = fixture(); f.document.visibilityState = 'hidden';
  const dispose = maintainScreenWakeLock(f); await flush(); assert.equal(f.calls, 0); dispose();
  assert.doesNotThrow(() => maintainScreenWakeLock({ ...f, navigator: {} })());
});
