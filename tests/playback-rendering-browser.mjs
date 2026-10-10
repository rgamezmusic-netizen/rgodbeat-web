// Exercise real providers in isolation: no catalog, account or audio downloads.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {PlayerProvider,usePlayer,usePlayerState} from './contexts/PlayerContext';
    import {AtmosphereProvider,useAtmosphere,useAtmosphereActions} from './components/atmosphere/AtmosphereContext';
    import {canPrefetchInBackground} from './lib/browser/prefetch';
    window.canPrefetch=canPrefetchInBackground;
    window.renders={card:0,timeline:0,publisher:0,background:0};
    function Card(){usePlayerState();window.renders.card++;return null;}
    function Timeline(){const player=usePlayer();window.player=player;window.renders.timeline++;
      return <span id="time">{player.currentTime}</span>;}
    function Publisher(){window.atmosphere=useAtmosphereActions();window.renders.publisher++;return null;}
    function Background(){const {hoverState}=useAtmosphere();window.renders.background++;
      return <span id="hover">{hoverState?.x}</span>;}
    createRoot(document.getElementById('root')).render(<PlayerProvider><AtmosphereProvider>
      <Card/><Timeline/><Publisher/><Background/>
    </AtmosphereProvider></PlayerProvider>);`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.evaluate(() => {
    const NativeAudio = window.Audio;
    window.Audio = function (...args) { const audio = new NativeAudio(...args); window.preview = audio; return audio; };
    window.Audio.prototype = NativeAudio.prototype;
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.preview && window.player);
  const before = await page.evaluate(() => ({ ...window.renders }));
  await page.evaluate(() => {
    Object.defineProperty(window.preview, 'duration', { value: 100 });
    window.preview.currentTime = 12;
    window.preview.dispatchEvent(new Event('timeupdate'));
  });
  await page.waitForFunction(() => document.getElementById('time').textContent === '0:12');
  const tick = await page.evaluate(() => ({ ...window.renders }));
  assert.equal(tick.card, before.card, 'Audio progress must not rerender catalog cards');
  assert.equal(tick.background, before.background, 'Audio progress must not rerender decoration');
  assert.ok(tick.timeline > before.timeline, 'The playback counter must still update');
  await page.evaluate(() => window.player.setVolume(0.4));
  await page.waitForFunction(() => window.preview.volume === 0.4 && window.player.volume === 0.4);
  await page.waitForFunction(previous => window.renders.card > previous, tick.card);
  const publisher = await page.evaluate(() => window.renders.publisher);
  await page.evaluate(() => window.atmosphere.setHoverState({ active: true, x: 123, y: 50 }));
  await page.waitForFunction(() => document.getElementById('hover').textContent === '123');
  assert.equal(await page.evaluate(() => window.renders.publisher), publisher, 'Publishing hover must not rerender every card');
  for (const [connection, online, expected] of [
    [{ effectiveType: '4g', downlink: 10 }, true, true],
    [{ effectiveType: '4g', saveData: true }, true, false],
    [{ effectiveType: '3g' }, true, false],
    [{ effectiveType: '2g' }, true, false],
    [{ effectiveType: 'slow-2g' }, true, false],
    [{ downlink: 0.8 }, true, false],
    [undefined, false, false], [undefined, true, true],
  ]) {
    const actual = await page.evaluate(({ connection, online }) => {
      Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
      Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
      return window.canPrefetch();
    }, { connection, online });
    assert.equal(actual, expected);
  }
  assert.equal(await page.evaluate(() => window.preview.getAttribute('src')), null);
  assert.deepEqual(errors, []);
  console.log('PASS: audio ticks isolated from cards/background, volume preserved, hover publishers isolated, slow/offline/data-saver network policies');
} finally { await browser.close(); }
