// Production preview only. Reads public pages and checks local browser state.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.RG_PERF_URL || 'http://127.0.0.1:3100';
const output = process.env.RG_PERF_SCREENSHOTS || '/tmp/rg-adaptive-load';
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile('.next/react-loadable-manifest.json', 'utf8'));
const studioEntry = Object.entries(manifest).find(([key]) => key.includes('NavigationPreloader') && key.includes('StudioApp'));
assert.ok(studioEntry, 'Find Studio chunks from this build');
// Shared icon chunks also appear in Park routes. Identify the actual DAW module.
const studioFiles = [];
for (const file of studioEntry[1].files) {
  if (/StudioApp:\s*\(\)\s*=>/.test(await readFile(`.next/${file}`, 'utf8'))) studioFiles.push(file);
}
assert.ok(studioFiles.length);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    // Keep the fast-network scenario independent of Chrome's changing estimate.
    const connection = new EventTarget();
    connection.effectiveType = '4g';
    connection.downlink = 10;
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
  });
  const scripts = [], errors = [], media = [], backgroundRoutes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.resourceType() === 'script') scripts.push(request.url());
    if (request.resourceType() === 'media') media.push(request.url());
    if (request.url().includes('_rsc=')) backgroundRoutes.push(new URL(request.url()).pathname);
  });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(12000);
  assert.ok(studioFiles.every(file => scripts.every(url => !url.includes(file))), 'Do not download DSP/Studio while browsing the homepage');
  assert.ok(!backgroundRoutes.some(path => path.startsWith('/park/')), 'Defer organization tools until the visitor explores');
  assert.equal(await page.getByRole('heading', { name: 'Latest Releases', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Play preview of|Escuchar beat/ }).count(), 0);
  const homeServices = await page.locator('#services article').allInnerTexts();
  assert.equal(homeServices.length, 4);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForFunction(files => performance.getEntriesByType('resource').some(resource => files.some(file => resource.name.includes(file))), studioFiles);
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(resource => new URL(resource.name).pathname === '/park/documents'));
  assert.ok(backgroundRoutes.includes('/park/documents'), 'Scrolling prepares public organization tools');
  assert.equal(media.length, 0, 'Progressive preload cannot start audio');
  await page.goto(`${base}/services`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'SERVICIOS / RGODBEAT', exact: true }).waitFor();
  assert.deepEqual(await page.locator('#services article').allInnerTexts(), homeServices, 'Home and Services share the same prices and scope');
  for (const card of await page.locator('#services article').all()) {
    const href = await card.getByRole('link', { name: 'CONSULTAR SERVICIO →' }).getAttribute('href');
    assert.ok(href.startsWith('mailto:rgodbeat@gmail.com?subject='));
    assert.match(decodeURIComponent(href), /Referencia publicada:.*USD/);
  }
  assert.equal(await page.locator('#services a[href="#contact"]').count(), 0);
  await page.screenshot({ path: `${output}/services-1440.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await page.close();

  const constrained = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const routes = [];
  constrained.on('request', request => { if (request.url().includes('_rsc=')) routes.push(new URL(request.url()).pathname); });
  await constrained.addInitScript(() => {
    const connection = new EventTarget();
    connection.saveData = true;
    connection.effectiveType = '4g';
    Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
  });
  await constrained.goto(base, { waitUntil: 'load' });
  await constrained.waitForTimeout(5000);
  assert.ok(!routes.some(path => /^\/(park|the-park|studio|download|services|about)(\/|$)/.test(path)), 'Data saver skips secondary route queue');
  await constrained.getByRole('button', { name: 'Toggle mobile menu' }).click();
  await constrained.locator('nav a[href="/park"]').filter({ visible: true }).click();
  await constrained.waitForURL(`${base}/park`);
  await constrained.getByRole('heading', { name: 'Graba en el estudio', exact: true }).waitFor();
  assert.equal(new URL(constrained.url()).pathname, '/park', 'Navigation still works with data saver');
  await constrained.close();

  for (const width of [390, 1440]) {
    const park = await browser.newPage({ viewport: { width, height: 900 } });
    const pageErrors = [];
    park.on('pageerror', error => pageErrors.push(error.message));
    for (const path of ['/park', '/the-park']) {
      await park.goto(`${base}${path}`, { waitUntil: 'load' });
      const section = park.getByRole('region', { name: 'Grabación y mix y master con The Park' });
      await section.getByRole('heading', { name: 'Graba en el estudio', exact: true }).waitFor();
      assert.match(await section.innerText(), /Si estás en Austin/);
      assert.match(await section.innerText(), /Si no estás en Austin/);
      assert.match(await section.innerText(), /derechos, registros y documentos/);
      assert.ok((await section.getByRole('link', { name: 'Consultar sesión en Austin →' }).getAttribute('href')).startsWith('mailto:rgodbeat@gmail.com'));
      assert.ok((await section.getByRole('link', { name: 'Consultar mix y master →' }).getAttribute('href')).startsWith('mailto:rgodbeat@gmail.com'));
      if (path === '/park') {
        for (const href of ['/park/catalog', '/park/registrations', '/park/documents', '/park/profile']) {
          assert.ok(await park.locator(`header a[href="${href}"]`).count(), `Preserve ${href}`);
        }
      }
      await section.scrollIntoViewIfNeeded();
      assert.ok(await park.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} fits ${width}px`);
      await park.screenshot({ path: `${output}/${path.slice(1)}-${width}.png` });
    }
    assert.deepEqual(pageErrors, []);
    await park.close();
  }
  console.log('PASS: public pages and Studio prepare after scrolling, consistent service prices, data saver skips secondary routes, navigation still works, Austin/remote services and Park tools preserved at 390/1440px');
} finally { await browser.close(); }
