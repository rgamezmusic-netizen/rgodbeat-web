// Run against a production server. No votes, purchases, account changes or recording.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.RG_PERF_URL || 'http://127.0.0.1:3100';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], documents = [], media = [], runtimeRequests = [];
    const warmed = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.resourceType() === 'document') documents.push(request.url());
      if (request.resourceType() === 'media') media.push(request.url());
      if (request.url().includes('_rsc=') && !request.headers()['next-router-prefetch']) runtimeRequests.push(new URL(request.url()).pathname);
    });
    page.on('response', async response => {
      // FULL prefetches intentionally use the normal Flight request headers.
      if (!response.url().includes('_rsc=')) return;
      if (response.ok() && !response.request().headers()['next-router-prefetch']) warmed.add(new URL(response.url()).pathname);
    });
    // Add latency to route fetches: a warm navigation must not wait for these.
    await page.route('**/*', async route => {
      if (route.request().url().includes('_rsc=')) await new Promise(resolve => setTimeout(resolve, 600));
      await route.continue();
    });
    await page.addInitScript(() => {
      // This suite checks full precaching on a fast connection. Data saver and
      // slow-network behavior are covered separately in adaptive-load-browser.
      const connection = new EventTarget();
      connection.effectiveType = '4g';
      connection.downlink = 10;
      Object.defineProperty(navigator, 'connection', { value: connection, configurable: true });
      window.__audioContexts = 0; window.__microphoneRequests = 0;
      const NativeAudioContext = window.AudioContext;
      if (NativeAudioContext) window.AudioContext = class extends NativeAudioContext {
        constructor(...args) { super(...args); window.__audioContexts++; }
      };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => {
        window.__microphoneRequests++;
        return Promise.reject(new Error('Preloading cannot request the microphone'));
      };
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.getByRole('heading', { name: 'YOUR SOUND. YOUR SIGNATURE.' }).waitFor();
    const deadline = Date.now() + 25_000;
    while ((!warmed.has('/ranking/season') || !warmed.has('/beats')) && Date.now() < deadline) await page.waitForTimeout(100);
    assert.ok(warmed.has('/ranking/season'), 'TOP 23 must start its full prefetch before the first click');
    assert.ok(warmed.has('/beats'), 'Catalog must start its full prefetch before the first click');
    // Give later code imports time to complete, including Studio and cart.
    await page.waitForTimeout(9000);
    assert.equal(media.length, 0, 'Background warming must not download audio');
    assert.equal(await page.evaluate(() => window.__audioContexts), 0, 'Importing Studio cannot initialize audio');
    assert.equal(await page.evaluate(() => window.__microphoneRequests), 0);
    await page.evaluate(() => {
      window.__navigationMarker = true;
      window.__loadingFlashes = [];
      new MutationObserver(() => {
        for (const node of document.querySelectorAll('[role="status"]')) {
          if (node.checkVisibility() && /Cargando (sección|temporada|catálogo|tu perfil)/i.test(node.textContent)) window.__loadingFlashes.push(node.textContent);
        }
      }).observe(document.body, { subtree: true, childList: true });
    });
    const runtimeBefore = runtimeRequests.length;
    const times = [];
    async function navigate(path) {
      let link = page.locator(`nav a[href="${path}"]`).filter({ visible: true }).first();
      if (!await link.count()) {
        await page.getByRole('button', { name: 'Toggle mobile menu' }).click();
        link = page.locator(`nav a[href="${path}"]`).filter({ visible: true }).first();
      }
      const started = Date.now();
      await link.click();
      if (path === '/ranking/season') await page.getByRole('tab', { name: 'TRACKS', exact: true }).waitFor();
      else if (path === '/beats') await page.getByRole('textbox', { name: 'Search catalog by title, genre, mood, BPM, or key' }).waitFor();
      else await page.getByRole('heading', { name: 'YOUR SOUND. YOUR SIGNATURE.' }).waitFor();
      times.push({ path, ms: Date.now() - started });
    }
    await navigate('/ranking/season');
    await page.getByRole('tab', { name: 'ARTISTS', exact: true }).click();
    await navigate('/beats');
    await page.getByRole('textbox', { name: 'Search catalog by title, genre, mood, BPM, or key' }).fill('wings');
    await page.getByRole('combobox', { name: 'Sort Beats' }).selectOption('price_desc');
    await page.getByRole('group', { name: 'Genre Filters' }).getByRole('button', { name: 'TRAP', exact: true }).click();
    await navigate('/ranking/season');
    assert.equal(await page.getByRole('tab', { name: 'ARTISTS', exact: true }).getAttribute('aria-selected'), 'true', 'Keep the chosen ranking tab');
    await navigate('/');
    await page.getByRole('heading', { name: 'YOUR SOUND. YOUR SIGNATURE.' }).waitFor();
    await navigate('/beats');
    assert.equal(await page.getByRole('textbox', { name: 'Search catalog by title, genre, mood, BPM, or key' }).inputValue(), 'wings');
    assert.equal(await page.getByRole('combobox', { name: 'Sort Beats' }).inputValue(), 'price_desc');
    assert.equal(await page.getByRole('group', { name: 'Genre Filters' }).getByRole('button', { name: 'TRAP', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(runtimeRequests.slice(runtimeBefore).filter(path => ['/', '/beats', '/ranking/season'].includes(path)), [], 'Warm clicks and revisits cannot refetch their page data; exploration may prepare other sections');
    assert.deepEqual(await page.evaluate(() => window.__loadingFlashes), [], 'No loading screen flashes on warm navigation');
    assert.equal(await page.evaluate(() => window.__navigationMarker), true);
    assert.equal(documents.length, 1, 'Keep the document, global player and cart');
    // Let the native five-minute cache expire while staying in the catalog.
    // The persistent preloader must refresh TOP 23 before the next click.
    const previousRankFetches = runtimeRequests.filter(path => path === '/ranking/season').length;
    await page.clock.install();
    await page.clock.fastForward(310_000);
    const refreshDeadline = Date.now() + 15_000;
    while (runtimeRequests.filter(path => path === '/ranking/season').length === previousRankFetches && Date.now() < refreshDeadline) await page.waitForTimeout(100);
    assert.ok(runtimeRequests.filter(path => path === '/ranking/season').length > previousRankFetches, 'Expired routes refresh in the background');
    await page.waitForTimeout(4000);
    const refreshedRankFetches = runtimeRequests.filter(path => path === '/ranking/season').length;
    await navigate('/ranking/season');
    assert.equal(runtimeRequests.filter(path => path === '/ranking/season').length, refreshedRankFetches, 'Click uses the refreshed warm route');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: full data before click, no navigation fetches/loading screens, tab/search/sort/genre retained, cache renewal while idle, no audio or microphone; ${JSON.stringify(times)}`);
    await page.close();
  }
} finally { await browser.close(); }
