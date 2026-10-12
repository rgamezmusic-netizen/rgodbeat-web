// Actual component + SSR hydration in an isolated browser. No artist accounts or external registrations are touched.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { loadSource } from './helpers/rg-fixtures.mjs';

const { chromium, webkit } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const { RightsRegistrationGuide } = loadSource('components/park/RightsRegistrationGuide.tsx');
const markup = renderToString(React.createElement(RightsRegistrationGuide));
const bundle = await build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import React from 'react';
    import {hydrateRoot} from 'react-dom/client';
    import {RightsRegistrationGuide} from './components/park/RightsRegistrationGuide';
    window.hydrationErrors=[];
    hydrateRoot(document.getElementById('root'), <RightsRegistrationGuide/>, {onRecoverableError:e=>window.hydrationErrors.push(e.message)});
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife',
  define: { 'process.env.NODE_ENV': '"development"' },
});
const styles = await postcss([tailwind()]).process(await readFile('app/globals.css', 'utf8'), { from: `${process.cwd()}/app/globals.css` });
const server = createServer((req, res) => {
  if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(styles.css); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root">${markup}</div><script src="/app.js"></script></body></html>`); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const KEY = 'rgodbeat_park_song_checklists_v2';
const LEGACY = 'rgodbeat_park_rights_guide_v1';
const output = '/private/tmp/rgodbeat-park-checklists';
await mkdir(output, { recursive: true });
async function add(page, name) {
  await page.getByLabel('Nombre del tema', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Añadir tema', exact: true }).click();
}
function songRow(page, name) {
  return page.getByRole('list', { name: 'Checklist de mis temas' }).locator(':scope > li')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}
async function mark(page, song, step) {
  const row = songRow(page, song);
  await row.getByText(step, { exact: true }).click();
  assert.equal(await row.getByRole('checkbox', { name: `${step} para ${song}`, exact: true }).isChecked(), true);
}
async function fits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

try {
  const engines = process.env.STUDIO_TEST_BROWSER === 'webkit' ? [['webkit', webkit]] : [['chromium', chromium]];
  for (const [name, type] of engines) {
    const browser = await type.launch(name === 'chromium' ? { channel: 'chrome', headless: true } : { headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.getByRole('button', { name: 'Añadir tema', exact: true }).waitFor();
      await page.getByText('Todavía no tienes temas en tu checklist.', { exact: false }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Añadir tema', exact: true }).isDisabled(), true);
      await add(page, 'Tema Uno');
      await mark(page, 'Tema Uno', 'BMI');
      await mark(page, 'Tema Uno', 'The MLC');
      await add(page, 'Tema Dos');
      await mark(page, 'Tema Dos', 'SoundExchange');
      assert.equal(await songRow(page, 'Tema Dos').getByRole('checkbox', { name: 'BMI para Tema Dos', exact: true }).isChecked(), false);
      assert.equal(await songRow(page, 'Tema Uno').getByRole('checkbox', { name: 'SoundExchange para Tema Uno', exact: true }).isChecked(), false);
      await page.reload();
      await songRow(page, 'Tema Uno').waitFor();
      assert.equal(await songRow(page, 'Tema Uno').getByRole('checkbox', { name: 'BMI para Tema Uno', exact: true }).isChecked(), true);
      assert.equal(await songRow(page, 'Tema Dos').getByRole('checkbox', { name: 'SoundExchange para Tema Dos', exact: true }).isChecked(), true);
      await page.getByRole('button', { name: 'Editar nombre de Tema Uno', exact: true }).click();
      await page.getByLabel('Nuevo nombre del tema', { exact: true }).fill('Tema Renombrado');
      await page.getByRole('button', { name: 'Guardar nombre', exact: true }).click();
      assert.equal(await songRow(page, 'Tema Renombrado').getByRole('checkbox', { name: 'BMI para Tema Renombrado', exact: true }).isChecked(), true);
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await fits(page);
        await page.screenshot({ path: `${output}/${name}-${width}.png` });
      }
      // Deletion can be cancelled, and confirmed deletion preserves other songs.
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: 'Eliminar checklist de Tema Dos', exact: true }).click();
      assert.equal(await songRow(page, 'Tema Dos').count(), 1);
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: 'Eliminar checklist de Tema Dos', exact: true }).click();
      await page.reload();
      await songRow(page, 'Tema Renombrado').waitFor();
      assert.equal(await songRow(page, 'Tema Dos').count(), 0);
      assert.equal(await songRow(page, 'Tema Renombrado').getByRole('checkbox', { name: 'The MLC para Tema Renombrado', exact: true }).isChecked(), true);
      // Storage errors must not falsely claim success; retry commits the in-memory state.
      await page.evaluate(() => {
        window.originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new DOMException('Test quota', 'QuotaExceededError'); };
      });
      await add(page, 'Sin guardar');
      await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).waitFor();
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).length, KEY), 1);
      await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
      await page.getByRole('button', { name: 'Reintentar guardado', exact: true }).click();
      await page.reload();
      await songRow(page, 'Sin guardar').waitFor();
      // Old unnamed marks migrate without claiming they belong to a specific piece.
      await page.evaluate(({ KEY, LEGACY }) => {
        localStorage.removeItem(KEY);
        localStorage.setItem(LEGACY, JSON.stringify({ youtube: true, bmi: true }));
        localStorage.setItem('rgodbeat_park_projects_v1', 'preserve-unrelated-data');
      }, { KEY, LEGACY });
      await page.reload();
      await songRow(page, 'Checklist anterior').waitFor();
      assert.equal(await songRow(page, 'Checklist anterior').getByRole('checkbox', { name: 'BMI para Checklist anterior', exact: true }).isChecked(), true);
      await add(page, 'Tema Nuevo');
      await page.reload();
      await songRow(page, 'Tema Nuevo').waitFor();
      assert.equal(await songRow(page, 'Checklist anterior').getByRole('checkbox', { name: 'YouTube y Content ID para Checklist anterior', exact: true }).isChecked(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem('rgodbeat_park_projects_v1')), 'preserve-unrelated-data');
      // Corrupt data is not silently overwritten or replaced by an older checklist.
      await page.evaluate(key => localStorage.setItem(key, '{invalid'), KEY);
      await page.reload();
      await page.getByRole('status').filter({ hasText: 'No se pudo leer' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Añadir tema', exact: true }).isDisabled(), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), KEY), '{invalid');
      assert.deepEqual(errors, []);
      assert.deepEqual(await page.evaluate(() => window.hydrationErrors), []);
      await context.close();

      const blocked = await browser.newContext({ viewport: { width: 320, height: 844 } });
      await blocked.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      });
      const blockedPage = await blocked.newPage();
      blockedPage.on('pageerror', error => errors.push(error.message));
      await blockedPage.goto(url);
      await blockedPage.getByRole('status').filter({ hasText: 'no permite guardar' }).waitFor();
      await add(blockedPage, 'Tema temporal');
      await songRow(blockedPage, 'Tema temporal').waitFor();
      await blockedPage.getByRole('button', { name: 'Reintentar guardado', exact: true }).waitFor();
      // Very long names also wrap without making mobile controls overflow.
      await add(blockedPage, 'M'.repeat(200));
      await fits(blockedPage);
      assert.deepEqual(errors, []);
      await blocked.close();
      console.log(`PASS ${name}: independent song marks, reload, rename, safe deletion, legacy migration, storage failure/retry, SSR and 320/390/1280px layouts`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
