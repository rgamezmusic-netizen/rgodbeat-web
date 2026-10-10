// Run against `npm run build && npm run start -- --port 3100`.
// RG_PERF_PLAYWRIGHT_MODULE may point to an existing Playwright index.mjs.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const baseUrl = process.env.RG_PERF_URL || 'http://localhost:3100';
const output = process.argv[2] || '/tmp/rg-performance';
const runs = Number(process.env.RG_PERF_RUNS || 3);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const path of ['/', '/beats']) {
    // Warm the server, not the browser cache (each measured run has a new context).
    await fetch(`${baseUrl}${path}`);
    for (let run = 1; run <= runs; run++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const requests = new Map();
      const errors = [];
      cdp.on('Network.responseReceived', ({ requestId, type, response }) => requests.set(requestId, { type, url: response.url, status: response.status, bytes: 0 }));
      // Count bytes already received even if a large image is still downloading.
      cdp.on('Network.dataReceived', ({ requestId, encodedDataLength }) => { const entry = requests.get(requestId); if (entry) entry.bytes += encodedDataLength; });
      cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => { const entry = requests.get(requestId); if (entry) entry.bytes = encodedDataLength; });
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.__loadMetrics = { lcp: 0, cls: 0 };
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.__loadMetrics.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__loadMetrics.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(8000);
      const metrics = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return { ...window.__loadMetrics, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null, ttfb: nav.responseStart, load: nav.loadEventEnd,
          title: document.title, text: document.body.innerText,
          images: Array.from(document.images, img => ({ src: img.currentSrc, loading: img.loading, width: img.width, height: img.height, naturalWidth: img.naturalWidth })),
          scripts: Array.from(document.scripts).filter(s => s.src).map(s => ({ src: s.src, async: s.async, defer: s.defer, type: s.type })) };
      });
      const network = [...requests.values()];
      const bytes = type => network.filter(r => !type || r.type === type).reduce((sum, r) => sum + r.bytes, 0);
      const result = { path, run, ...metrics, transferBytes: bytes(), jsBytes: bytes('Script'), imageBytes: bytes('Image'), audioRequests: network.filter(r => r.type === 'Media' || /\/previews\/|\.mp3(?:\?|$)/.test(r.url)).length, errors, network };
      results.push(result);
      await writeFile(`${output}/results.json`, JSON.stringify({ measuredAt: new Date().toISOString(), baseUrl, conditions: { viewport: '390x844', dpr: 3, downloadMbps: 1.6, latencyMs: 150, cpuSlowdown: 4, cache: 'disabled; server warmed', observeAfterDomContentLoadedMs: 8000 }, results }, null, 2));
      if (run === 1) await page.screenshot({ path: `${output}/${path === '/' ? 'home' : 'beats'}.png`, fullPage: true, timeout: 15000 });
      console.log(JSON.stringify({ path, run, fcp: result.fcp, lcp: result.lcp, ttfb: result.ttfb, load: result.load, cls: result.cls, transferBytes: result.transferBytes, jsBytes: result.jsBytes, imageBytes: result.imageBytes, audioRequests: result.audioRequests, errors }));
      await context.close();
    }
  }
} finally {
  await browser.close();
}
