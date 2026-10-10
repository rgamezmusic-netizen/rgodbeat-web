// The actual star renderer with local props only; no server or network access.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const bundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';
    import {ProceduralStarfield} from './components/atmosphere/ProceduralStarfield';
    const root=createRoot(document.getElementById('root'));
    window.showStars=props=>root.render(<ProceduralStarfield {...props}/>);`, loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(() => {
    window.__randomCalls = 0;
    const random = Math.random;
    Math.random = () => { window.__randomCalls++; return random(); };
    window.showStars({ density: 'high', animate: false });
  });
  await page.locator('[data-starfield]').waitFor();
  const created = await page.evaluate(() => window.__randomCalls);
  assert.ok(created > 0);
  for (const props of [{ playing: true }, { playing: false }, { animate: true }, { animate: false }, { opacity: 0.5, density: 'medium', tint: 'neutral' }]) {
    await page.evaluate(props => window.showStars({ density: 'high', animate: false, ...props }), props);
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.__randomCalls), created, 'Changing playback/settings must keep the constellation');
  }
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForFunction(() => document.querySelector('canvas').style.width === '1000px');
  assert.equal(await page.evaluate(() => window.__randomCalls), created, 'Resize must not generate a new constellation');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => window.__randomCalls), created, 'Returning to the browser tab must preserve stars');
  assert.deepEqual(errors, []);
  console.log('PASS: playback, motion settings, density/tint changes, resizing and browser-tab return preserve the original constellation');
} finally { await browser.close(); }
