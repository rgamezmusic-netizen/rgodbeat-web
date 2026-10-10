// Local production regression: no votes, orders or account writes.
import assert from 'node:assert/strict';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.RG_PERF_URL || 'http://127.0.0.1:3100';
const output = process.env.RG_PERF_SCREENSHOTS || '/tmp/rg-web-perf';
await mkdir(output, { recursive: true });
const starChunks = [];
for (const filename of await readdir('.next/static/chunks')) {
  if (filename.endsWith('.js') && (await readFile(`.next/static/chunks/${filename}`, 'utf8')).includes('data-starfield')) starChunks.push(filename);
}
assert.equal(starChunks.length, 1, 'The star renderer must live in one deferred chunk');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], starLoads = [], backgrounds = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (decodeURIComponent(request.url()).includes('/atmosphere/studio-env.jpg')) backgrounds.push(request.url());
    });
    await page.route(`**/chunks/${starChunks[0]}`, async route => {
      starLoads.push(await page.evaluate(() => ({ ready: document.readyState, heading: !!document.querySelector('h1') })));
      await route.continue();
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.locator('[data-starfield]').waitFor();
    assert.deepEqual(starLoads, [{ ready: 'complete', heading: true }], 'Load decorative code only after the main page');
    await page.evaluate(() => { window.__persistentCanvas = document.querySelector('[data-starfield]'); });
    const sameCanvas = async () => {
      assert.equal(await page.locator('[data-starfield]').count(), 1);
      assert.ok(await page.evaluate(() => document.querySelector('[data-starfield]') === window.__persistentCanvas));
    };
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${output}/persistent-home-${width}.png` });
    await page.getByRole('navigation', { name: 'Explorar RGODBEAT' }).getByRole('link', { name: 'TOP 23', exact: true }).click();
    await page.getByRole('tab', { name: 'TRACKS', exact: true }).waitFor();
    await sameCanvas();
    for (const kind of ['ARTISTS', 'BEATS', 'TRACKS']) {
      await page.getByRole('tab', { name: kind, exact: true }).click();
      await sameCanvas();
    }
    await page.screenshot({ path: `${output}/persistent-top23-${width}.png` });
    if (width === 390) await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
    await page.locator('nav').getByRole('link', { name: /^BEATS/ }).filter({ visible: true }).click();
    await page.getByRole('textbox', { name: 'Search catalog by title, genre, mood, BPM, or key' }).waitFor();
    await sameCanvas();
    if (width === 390) await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
    await page.locator('nav a[href="/studio"]').filter({ visible: true }).click();
    await page.waitForURL(`${base}/studio`);
    await page.waitForFunction(() => document.querySelector('[data-persistent-atmosphere]')?.hidden === true);
    await sameCanvas();
    await page.goBack();
    await page.waitForURL(`${base}/beats`);
    await page.locator('[data-starfield]').waitFor({ state: 'visible' });
    await sameCanvas();
    assert.equal(starLoads.length, 1, 'Route changes must never download the star renderer again');
    assert.equal(backgrounds.length, 1, 'The environment image must not be requested again');
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: stars load last, one canvas across Top 23/tabs/catalog/Studio/back, one effect download and one background image request, no runtime errors`);
    await page.close();
  }
} finally { await browser.close(); }
