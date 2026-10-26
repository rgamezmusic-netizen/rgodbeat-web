// Validates an isolated online build with no Supabase/R2/YouTube environment.
// Uses only a local server and an ephemeral browser context; no physical mic or account.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.STUDIO_TEST_URL ?? 'http://127.0.0.1:3104';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Run only against localhost.');
assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH, 'Set STUDIO_PLAYWRIGHT_PATH to an external Playwright installation.');
const { chromium } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
const page = await context.newPage();
const remoteServiceRequests = [];
const pageErrors = [];
page.on('request', request => {
  const hostname = new URL(request.url()).hostname.toLowerCase();
  if (hostname.endsWith('.supabase.co') || hostname.endsWith('.r2.cloudflarestorage.com')
    || hostname === 'youtube.googleapis.com' || hostname === 'www.googleapis.com') {
    remoteServiceRequests.push(request.url());
  }
});
page.on('pageerror', error => pageErrors.push(error.message));
await page.addInitScript(() => localStorage.setItem('rgodbeat_install_guide_hidden_v2', 'true'));

try {
  const access = await page.request.get(`${base}/api/studio/access`);
  assert.equal(access.status(), 200);
  const accessState = await access.json();
  assert.equal(accessState.isDemo, true);
  assert.equal(accessState.isLoggedIn, false);
  assert.equal(accessState.hasActivePass, false);
  assert.equal(accessState.email, null);
  assert.match(accessState.serviceMessage, /no configurados.*este dispositivo/i);

  const response = await page.goto(`${base}/studio`);
  assert.equal(response?.status(), 200);
  await page.getByText(/Servicios de cuenta no configurados; tu proyecto permanece en este dispositivo\./).waitFor();
  await page.getByText('Midnight 808', { exact: true }).first().waitFor();
  await page.getByTitle('Reproducir (Espacio)', { exact: true }).click();
  await page.getByTitle('Pausar (Espacio)', { exact: true }).waitFor();
  await page.getByTitle('Pausar (Espacio)', { exact: true }).click();

  // Exercise local recording with Chrome's generated test input, not a real mic.
  await page.getByTitle('Grabar en Lead 1', { exact: true }).click();
  await page.getByTitle('Pausar (Espacio)', { exact: true }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /STOP/ }).click();
  await page.getByTitle('Grabar en Lead 1', { exact: true }).waitFor();

  for (const path of ['/admin', '/park', '/account']) {
    const protectedResponse = await page.request.get(`${base}${path}`, { maxRedirects: 0 });
    assert.ok([302, 307, 308].includes(protectedResponse.status()), `${path} remains authentication-protected`);
    const location = protectedResponse.headers().location || '';
    assert.match(location, /\/login/);
    assert.match(location, /services_unavailable/);
  }
  await page.goto(`${base}/login?error=services_unavailable&redirect=%2Fadmin`);
  await page.getByText(/Supabase no está configurado para este entorno\. Las funciones de cuenta permanecen protegidas\./).waitFor();

  const upload = await page.request.post(`${base}/api/studio/project/upload`, { data: {} });
  assert.equal(upload.status(), 401, 'unauthenticated R2 project upload stays blocked');
  const publish = await page.request.post(`${base}/api/studio/youtube/publish`, { data: {} });
  assert.ok([401, 503].includes(publish.status()), 'YouTube publication stays blocked without auth/config');
  assert.deepEqual(remoteServiceRequests, [], 'unconfigured Preview must not contact production Supabase, R2, or YouTube');
  assert.deepEqual(pageErrors, []);
  console.log('PASS no-env Preview: local Studio, playback and synthetic-mic recording work; account routes, upload and YouTube remain blocked; zero production-service requests');
} finally {
  await context.close();
  await browser.close();
}
