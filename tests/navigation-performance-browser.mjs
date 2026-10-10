// Run against a local production build. Reads pages and switches tabs only.
// RG_PERF_PLAYWRIGHT_MODULE can point to an external Playwright installation.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.RG_PERF_URL || 'http://127.0.0.1:3100';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], documents = [], media = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.resourceType() === 'document') documents.push(request.url());
      if (request.resourceType() === 'media') media.push(request.url());
    });
    await page.addInitScript(() => {
      window.__canvasDraws = 0;
      const draw = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        window.__canvasDraws++;
        return draw.apply(this, args);
      };
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.locator('article').first().waitFor();
    await page.locator('[data-starfield]').waitFor();
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__canvasDraws = 0; window.__navigationMarker = true; });
    await page.waitForTimeout(1000);
    const draws = await page.evaluate(() => window.__canvasDraws);
    assert.ok(draws > 0 && draws <= 32, `Decorative canvas should paint at most 30 times/sec: ${draws}`);
    // Repeated scroll events must pause expensive drawing until scrolling stops.
    await page.evaluate(async () => {
      window.dispatchEvent(new Event('scroll'));
      window.__canvasDraws = 0;
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 40));
        window.dispatchEvent(new Event('scroll'));
      }
    });
    assert.equal(await page.evaluate(() => window.__canvasDraws), 0);
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => window.__canvasDraws > 0), 'Stars resume after scrolling');
    const started = Date.now();
    await page.getByRole('navigation', { name: 'Explorar RGODBEAT' }).getByRole('link', { name: 'TOP 23', exact: true }).click();
    await page.getByRole('heading', { name: 'RG TOP 23.', exact: true }).waitFor();
    const feedbackMs = Date.now() - started;
    await page.getByRole('tab', { name: 'TRACKS', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__navigationMarker), true, 'TOP 23 must preserve the document and player');
    assert.equal(documents.length, 1, 'Internal navigation must not reload HTML');
    for (const kind of ['ARTISTS', 'BEATS', 'TRACKS']) {
      await page.getByRole('tab', { name: kind, exact: true }).click();
      assert.equal(await page.getByRole('tab', { name: kind, exact: true }).getAttribute('aria-selected'), 'true');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    if (width === 390) await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
    await page.locator('nav').getByRole('link', { name: /^BEATS/ }).filter({ visible: true }).click();
    await page.waitForURL(`${base}/beats`);
    await page.getByRole('textbox', { name: 'Search catalog by title, genre, mood, BPM, or key' }).waitFor();
    assert.equal(await page.evaluate(() => window.__navigationMarker), true, 'Catalog navigation keeps the same document');
    assert.equal(documents.length, 1);
    assert.equal(media.length, 0, 'Navigation must not download previews');
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: TOP 23 feedback ${feedbackMs}ms, ${draws} canvas draws/sec, scroll pause/resume, instant tabs, catalog navigation, no reloads/errors/audio downloads`);
    await page.close();
  }
} finally { await browser.close(); }
