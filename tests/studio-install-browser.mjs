// Actual React guide/hook in Chrome. Browser install events, OS signals and
// outcomes are injected; this does NOT install an app into macOS/iOS/Android.
import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from '@tailwindcss/node';

assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const { chromium } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
let server, browser, context, page, base;
before(async () => {
  const source = (await Promise.all(['components/studio/InstallAppModal.tsx', 'components/home/InstallStudioButton.tsx'].map(path => readFile(path, 'utf8')))).join('\n');
  const compiler = await compile(await readFile('app/globals.css', 'utf8'), { base: `${process.cwd()}/app`, onDependency() {} });
  const css = compiler.build(source.match(/[^\s"'`<>]+/g));
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {InstallAppModal} from './components/studio/InstallAppModal';
    import {InstallStudioButton} from './components/home/InstallStudioButton';
    import {useAppInstallation} from './hooks/useAppInstallation';
    function Fixture(){const [open,setOpen]=useState(false),[home,setHome]=useState(location.pathname === '/home'),installation=useAppInstallation();return home ? <>
      <InstallStudioButton/><button onClick={()=>setHome(false)}>Ir al Studio</button></> : <>
      <button onClick={()=>setOpen(true)}>Abrir instalación</button><output id="installed">{String(installation.isInstalled)}</output>
      <InstallAppModal isOpen={open} onClose={()=>setOpen(false)}/></>;
    }
    createRoot(document.getElementById('root')).render(<Fixture/>);
  ` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
  server = createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/app.css' ? 'text/css' : 'text/html');
    res.end(req.url === '/app.js' ? bundle.outputFiles[0].text : req.url === '/app.css' ? css : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
});
after(async () => { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); });
beforeEach(async () => { context = await browser.newContext({ viewport: { width: 390, height: 844 } }); page = await context.newPage(); });
afterEach(async () => { await context?.close(); });
async function open() { await page.goto(base); await page.getByRole('button', { name: 'Abrir instalación' }).click(); }
async function offer({ outcome = 'accepted', fail = false, hold = false } = {}) {
  await page.evaluate(({ outcome, fail, hold }) => {
    window.installCalls = 0;
    window.installGesture = false;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => {
      window.installCalls++; window.installGesture = navigator.userActivation.isActive;
      if (fail) throw new Error('Injected rejected prompt');
      if (hold) await new Promise(resolve => { window.releaseInstall = resolve; });
    };
    event.userChoice = Promise.resolve({ outcome, platform: 'web' });
    window.offerPrevented = !window.dispatchEvent(event);
  }, { outcome, fail, hold });
}

test('public install button opens the native prompt directly from a single click', async () => {
  await page.goto(base + '/home');
  await page.getByRole('button', { name: 'Instalar RGODBEAT Studio', exact: true }).waitFor();
  await offer();
  await page.getByRole('button', { name: 'Instalar RGODBEAT Studio', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => [installCalls, installGesture]), [1, true]);
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.getByRole('button', { name: 'Instalar RGODBEAT Studio', exact: true }).waitFor({ state: 'detached' });
});

for (const failure of ['dismissed', 'rejected']) test(`public button falls back to guidance after a ${failure} prompt without reusing the offer`, async () => {
  await page.goto(base + '/home');
  await page.getByRole('button', { name: 'Instalar RGODBEAT Studio', exact: true }).waitFor();
  await offer({ outcome: 'dismissed', fail: failure === 'rejected' });
  await page.getByRole('button', { name: 'Instalar RGODBEAT Studio', exact: true }).click();
  await page.getByRole('dialog', { name: 'Instala RGodbeat Studio' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => installCalls), 1);
});

test('the native offer survives navigation from the public button to the Studio guide', async () => {
  await page.goto(base + '/home');
  await page.getByRole('button', { name: 'Instalar RGODBEAT Studio', exact: true }).waitFor();
  await offer();
  await page.getByRole('button', { name: 'Ir al Studio', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir instalación', exact: true }).click();
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => [installCalls, installGesture]), [1, true]);
});

test('native offer captured while closed opens a direct one-click install with a real click gesture', async () => {
  await page.goto(base); await page.getByRole('button', { name: 'Abrir instalación' }).waitFor();
  await offer();
  await page.getByRole('button', { name: 'Abrir instalación' }).click();
  assert.equal(await page.getByRole('button', { name: 'SIGUIENTE →', exact: true }).count(), 0);
  if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.STUDIO_SCREENSHOT_DIR}/install-native.png` });
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Instalación solicitada' }).waitFor();
  assert.deepEqual(await page.evaluate(() => [installCalls, installGesture, offerPrevented]), [1, true, true]);
  assert.equal(await page.locator('#installed').textContent(), 'false', 'acceptance alone is not installation confirmation');
});

test('busy prompt prevents duplicate submission and modal closure; the consumed event cannot be reused', async () => {
  await open(); await offer({ hold: true });
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).click();
  const waiting = page.getByRole('button', { name: 'ESPERANDO CONFIRMACIÓN…', exact: true });
  assert.equal(await waiting.isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Cerrar tutorial' }).isDisabled(), true);
  await page.keyboard.press('Escape');
  await waiting.evaluate(button => { button.click(); button.click(); });
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.evaluate(() => window.releaseInstall());
  await page.getByRole('status').filter({ hasText: 'Instalación solicitada' }).waitFor();
  await page.getByRole('button', { name: 'Cerrar tutorial' }).click();
  await page.getByRole('button', { name: 'Abrir instalación' }).click();
  assert.equal(await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => installCalls), 1);
});

for (const failure of ['dismissed', 'rejected']) test(`${failure} native prompt keeps manual guidance and allows a new browser offer`, async () => {
  await open(); await offer({ outcome: 'dismissed', fail: failure === 'rejected' });
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).click();
  await page.getByRole('status').filter({ hasText: failure === 'dismissed' ? 'más tarde' : 'No se pudo abrir' }).waitFor();
  assert.equal(await page.locator('#installed').textContent(), 'false');
  assert.equal(await page.getByRole('button', { name: 'SIGUIENTE →', exact: true }).count(), 1);
  await offer();
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).click();
  assert.equal(await page.evaluate(() => installCalls), 1);
});

test('appinstalled updates both the modal and its parent without reload or persistent flags', async () => {
  await open(); await offer();
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.getByText('Studio ya está instalado o abierto como app.', { exact: false }).waitFor();
  assert.equal(await page.locator('#installed').textContent(), 'true');
  assert.equal(await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'VOLVER AL STUDIO', exact: true }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
});

test('standalone iOS signal avoids offering installation again', async () => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }));
  await open();
  await page.getByRole('button', { name: 'VOLVER AL STUDIO', exact: true }).waitFor();
  assert.equal(await page.locator('#installed').textContent(), 'true');
  await offer();
  assert.equal(await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).count(), 0);
});

test('iOS Safari has honest manual steps and no invented native install button', async () => {
  await context.close();
  context = await browser.newContext({ viewport: { width: 320, height: 740 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined }));
  await open();
  await page.getByRole('heading', { name: '1. Abre Compartir en Safari', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).count(), 0);
  await page.getByRole('heading', { name: '2. Añadir a pantalla de inicio', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'SIGUIENTE →', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.equal(await page.getByRole('combobox', { name: 'Sistema operativo' }).isVisible(), false, 'device settings stay folded');
  assert.equal(await page.getByRole('link', { name: 'Ayuda oficial del navegador' }).isVisible(), false);
  assert.equal(await page.getByLabel('Más opciones de Safari').isVisible(), true);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 664 }, { width: 820, height: 900 }]) {
    await page.setViewportSize(viewport);
    if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.STUDIO_SCREENSHOT_DIR}/install-safari-${viewport.width}.png` });
    const bounds = await page.getByRole('dialog').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { fits: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth, scrolls: element.scrollHeight > element.clientHeight + 1, height: element.clientHeight, content: element.scrollHeight };
    });
    assert.equal(bounds.fits && !bounds.scrolls, true, `the two steps and close action fit ${viewport.width} × ${viewport.height}: ${JSON.stringify(bounds)}`);
  }
  await page.setViewportSize({ width: 390, height: 664 });
  if (process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.STUDIO_SCREENSHOT_DIR}/install-safari-manual.png` });
  await page.locator('summary').click();
  assert.equal(await page.getByRole('combobox', { name: 'Sistema operativo' }).isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
});

test('manual device override keeps native installation separate and automatic detection restores it', async () => {
  await open(); await offer();
  await page.locator('summary').click();
  await page.getByRole('combobox', { name: 'Sistema operativo' }).selectOption('ios');
  await page.getByRole('combobox', { name: 'Navegador' }).selectOption('safari');
  await page.getByRole('heading', { name: '1. Abre Compartir en Safari', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Detectar automáticamente', exact: true }).click();
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).waitFor();
});

test('blocked localStorage and malformed browser events do not prevent using the guide', async () => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
  assert.equal(await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).count(), 0);
  await page.locator('summary').click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'SIGUIENTE →', exact: true }).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(errors, []);
});

for (const mode of ['missing', 'legacy']) test(`progressive installation still works with ${mode} matchMedia APIs`, async () => {
  await page.addInitScript(mode => {
    const native = window.matchMedia.bind(window);
    window.matchMedia = mode === 'missing' ? undefined : query => query === '(display-mode: standalone)'
      ? { matches: false, addListener() {}, removeListener() {} } : native(query);
  }, mode);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open();
  await page.getByRole('button', { name: 'SIGUIENTE →', exact: true }).waitFor();
  await offer();
  await page.getByRole('button', { name: 'INSTALAR AHORA →', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Instalación solicitada' }).waitFor();
  assert.deepEqual(errors, []);
});
