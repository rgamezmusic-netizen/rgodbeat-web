// Local production build only; isolated account/catalog responses and browser storage.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { selectFixtureBeat } from './helpers/studio-beat-browser.mjs';

const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3108';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const manifest = JSON.parse(await readFile('.next/react-loadable-manifest.json', 'utf8'));
const chunks = name => manifest[`components/studio/StudioApp.tsx -> ./${name}`].files;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage(), requested = new Set(), errors = [];
    page.on('request', r => requested.add(new URL(r.url()).pathname));
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base || (url.searchParams.has('_rsc') && url.pathname !== '/studio')) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 401, json: { error: 'Isolated test' } });
      return route.continue();
    });
    await page.route('**/api/studio/access', route => route.fulfill({ json: { isDemo: true, isLoggedIn: false, hasActivePass: false, email: null } }));
    await page.route('**/api/beats/ranking', route => route.fulfill({ json: { beats: [] } }));
    await page.addInitScript(() => localStorage.setItem('rgodbeat_install_guide_hidden_v2', 'true'));
    await page.goto(base + '/studio');
    await page.locator('[data-studio-ready="true"]').waitFor();
    await page.getByRole('dialog', { name: 'Biblioteca de beats' }).waitFor();
    const loaded = name => chunks(name).every(file => requested.has('/_next/' + file));
    for (const name of ['ExportModal', 'VocalFXModal', 'BeatFXModal', 'LoopModal', 'StudioSettingsModal', 'CloudProjectGalleryModal', 'CloudProjectSaveModal', 'UnlockPassModal', 'InstallAppModal']) {
      assert.equal(chunks(name).some(file => requested.has('/_next/' + file)), false, `${name} must not download during startup`);
    }
    await selectFixtureBeat(page, { alreadyOpen: true });
    await page.getByRole('button', { name: 'EXPORTAR', exact: true }).click();
    await page.getByRole('heading', { name: 'Tu canción está lista para salir' }).waitFor();
    assert.ok(loaded('ExportModal'));
    await page.getByRole('button', { name: 'Cerrar exportación' }).click();
    await page.getByTitle('Abrir Auto-Tune y Efectos de Voz').click();
    const fx = page.getByRole('heading', { name: 'Lead 1 FX & AUTO-TUNE' });
    await fx.waitFor();
    assert.ok(loaded('VocalFXModal'));
    await fx.locator('..').locator('..').getByRole('button').click();
    await page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await page.getByRole('button', { name: 'Ajustes de la app', exact: true }).click();
    await page.getByRole('dialog', { name: 'Ajustes de la app' }).waitFor();
    assert.ok(loaded('StudioSettingsModal'));
    await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
    await page.getByTitle('Iniciar Sesión en RGODBEAT Studio').click();
    const account = page.getByRole('heading', { name: 'INICIA SESIÓN EN TU CUENTA' });
    await account.waitFor();
    assert.ok(loaded('UnlockPassModal'));
    await page.getByPlaceholder('tu@email.com').fill('local@example.invalid');
    await account.locator('..').locator('..').getByRole('button').click();
    await page.getByTitle('Iniciar Sesión en RGODBEAT Studio').click();
    assert.equal(await page.getByPlaceholder('tu@email.com').inputValue(), 'local@example.invalid', 'Reopening retains account form state');
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: no closed-dialog downloads; beat selection, export, vocal FX, settings and preserved login form`);
    await context.close();
  }
} finally { await browser.close(); }
