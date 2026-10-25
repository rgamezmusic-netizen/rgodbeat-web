// Validate the built online app/manifest in isolated Chrome. No OS installation,
// production access, real account, upload or persistent browser profile.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.STUDIO_TEST_URL ?? 'http://127.0.0.1:3104';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname));
assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const { chromium } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
// A fresh normal profile permits installability diagnostics (private contexts
// correctly reject installation). This is never the user's Chrome profile.
const profile = await mkdtemp(join(tmpdir(), 'rgodbeat-pwa-check-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('rgodbeat_install_guide_hidden_v2', 'true'));
  await page.route('**/api/studio/access', route => route.fulfill({ json: { isDemo: true, isLoggedIn: false, hasActivePass: false, email: null } }));
  await page.goto(base + '/studio');
  await page.getByTitle('Reproducir (Espacio)', { exact: true }).waitFor();
  assert.match(await page.title(), /^RGodbeat Studio/);
  assert.equal(await page.locator('link[rel="manifest"]').count(), 1);
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.json');
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'), 'RGodbeat Studio');
  assert.equal(await page.locator('meta[name="application-name"]').getAttribute('content'), 'RGodbeat Studio');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  assert.match(viewport, /maximum-scale=5/);
  assert.match(viewport, /user-scalable=yes/);
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'), '/apple-touch-icon.png');
  const response = await page.request.get(base + '/manifest.json');
  assert.equal(response.status(), 200);
  assert.match(response.headers()['content-type'], /^application\/manifest\+json/);
  assert.equal(response.headers()['set-cookie'], undefined);
  const manifest = await response.json();
  const withCookie = await page.request.get(base + '/manifest.json', { headers: { Cookie: 'unrelated-fixture=not-a-real-token' } });
  assert.deepEqual(await withCookie.json(), manifest);
  assert.equal(withCookie.headers()['set-cookie'], undefined);
  assert.deepEqual(await page.evaluate(async icons => Promise.all(icons.map(async icon => {
    const image = new Image(); image.src = icon.src; await image.decode();
    return `${image.naturalWidth}x${image.naturalHeight}`;
  })), manifest.icons), manifest.icons.map(icon => icon.sizes));
  const cdp = await page.context().newCDPSession(page);
  const parsed = await cdp.send('Page.getAppManifest');
  assert.equal(parsed.url, base + '/manifest.json');
  assert.deepEqual(parsed.errors, []);
  assert.equal(JSON.parse(parsed.data).id, '/studio');
  console.log('PASS Chrome: production Studio metadata, public manifest media type, native manifest parser and decoded install icons');
  const diagnostics = await cdp.send('Page.getInstallabilityErrors');
  console.log('Chrome installability diagnostics (not an OS installation):', JSON.stringify(diagnostics));
  assert.deepEqual(diagnostics.installabilityErrors, []);
  const storage = await page.evaluate(async () => ({ registrations: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }));
  assert.deepEqual(storage, { registrations: 0, caches: [] });
  // Separate storage from the metadata check so its autosave cannot create a
  // project-choice modal in this playback-specific fixture.
  const playbackContext = await context.browser().newContext();
  await playbackContext.addInitScript(() => localStorage.setItem('rgodbeat_install_guide_hidden_v2', 'true'));
  const player = await playbackContext.newPage();
  await player.route('**/api/studio/access', route => route.fulfill({ json: { isDemo: true, isLoggedIn: false, hasActivePass: false, email: null } }));
  await player.goto(base + '/studio');
  await player.getByText('Midnight 808', { exact: true }).first().waitFor();
  await player.getByTitle('Reproducir (Espacio)', { exact: true }).click();
  await player.getByTitle('Pausar (Espacio)', { exact: true }).waitFor();
  await player.evaluate(() => localStorage.removeItem('rgodbeat_install_guide_hidden_v2'));
  // Re-evaluate automatic guidance through an ordinary UI transition while
  // playing, rather than racing the welcome timer during initial page loading.
  await player.getByTitle('Ajustes de filtro y volumen del Beat', { exact: true }).click();
  await player.getByRole('heading', { name: 'BEAT FILTER & FX', exact: true }).locator('xpath=../..').getByRole('button').click();
  await player.waitForTimeout(700);
  assert.equal(await player.getByRole('dialog', { name: 'Instala RGodbeat Studio' }).count(), 0, 'automatic install guide must not interrupt playback');
  await player.getByTitle('Pausar (Espacio)', { exact: true }).click();
  await player.getByRole('dialog', { name: 'Instala RGodbeat Studio' }).waitFor();
  await player.getByRole('button', { name: 'Cerrar tutorial' }).click();
  await playbackContext.close();
  console.log('PASS Chrome: automatic install guide waits until playback is paused');
  await page.goto(base + '/login');
  assert.equal(await page.locator('link[rel="manifest"]').count(), 0);
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS Chrome: web identity outside Studio retained; no Service Worker or Cache Storage introduced');
} finally { await context?.close(); await rm(profile, { recursive: true, force: true }); }
