// Production-browser regression. Only reads pages/audio and opens the cart;
// does not submit orders, votes or payments.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], media = [], scripts = [], formats = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.resourceType() === 'media') media.push(request.url());
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  page.on('response', response => {
    if (response.url().includes('/_next/image?')) formats.push(response.headers()['content-type']);
  });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__previewAudio = [];
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args);
      window.__previewAudio.push(audio);
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
  });
  await page.goto(process.env.RG_PERF_URL || 'http://localhost:3100', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  assert.equal(media.length, 0, 'No audio downloads before play');
  assert.equal(await page.evaluate(() => window.__previewAudio[0].preload), 'none');
  assert.equal(await page.evaluate(() => window.__previewAudio[0].getAttribute('src')), null);
  assert.ok(await page.evaluate(() => [...document.scripts].filter(s => s.src).every(s => s.async || s.defer || s.noModule)), 'Framework scripts must not block parsing');
  assert.ok(formats.length > 0 && formats.every(format => format === 'image/webp'), 'Optimized assets are delivered as WebP');
  assert.ok(await page.locator('img[alt="RGodbeat"]').getAttribute('srcset'), 'Logo has responsive sources');
  assert.equal(await page.locator('img[alt="RGodbeat Studio"]').getAttribute('loading'), 'lazy');

  assert.equal(await page.getByText('TU CARRITO', { exact: true }).count(), 0, 'Background imports must not open checkout');
  await page.getByRole('button', { name: /CART/ }).click();
  await page.getByText('TU CARRITO', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cerrar carrito' }).click();

  const card = page.locator('article').first();
  await card.hover();
  await card.getByRole('button', { name: /Play preview of/ }).click();
  await page.getByRole('complementary', { name: 'Global Beat Player' }).waitFor();
  await page.waitForFunction(() => window.__previewAudio[0].currentTime > 0, null, { timeout: 30000 });
  assert.ok(media.length > 0, 'Play starts the actual preview download');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__previewAudio[0].paused), true);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => !window.__previewAudio[0].paused);
  await page.getByRole('slider', { name: 'Seek audio preview' }).press('ArrowRight');
  assert.ok(await page.evaluate(() => window.__previewAudio[0].currentTime > 0));

  await card.getByRole('button', { name: /MP3 license to cart/ }).click();
  await page.getByText('TU CARRITO', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cerrar carrito' }).click();
  await page.getByRole('button', { name: /CART/ }).click();
  await page.getByText('1 ARTÍCULO', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: WebP, responsive/lazy images, asynchronous scripts, cart open/reopen, preview only on play, pause/resume/seek and cart reopen');
} finally {
  await browser.close();
}
