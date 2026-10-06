import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const { chromium } = await import(process.env.STUDIO_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href : 'playwright');
const baseUrl = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000/studio';
const bundle = await esbuild.build({
  stdin: {
    contents: `export { saveStudioSession, restoreLastStudioSession } from './lib/studio/audio/sessionStorage';`,
    resolveDir: path.resolve(import.meta.dirname, '..'),
  },
  bundle: true, write: false, format: 'iife', globalName: 'StudioTest', platform: 'browser',
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function fixture(owner = null, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const calls = { archives: 0, deletes: 0 };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => localStorage.setItem('rgodbeat_install_prompt_seen', 'true'));
  await context.route('**/api/studio/access', route => route.fulfill({ json: {
    isDemo: false, hasActivePass: true, isLoggedIn: Boolean(owner), email: owner, daysRemaining: 30,
  } }));
  await context.route('**/api/beats/ranking', route => route.fulfill({ json: { beats: [] } }));
  await context.route('**/api/studio/project', async route => {
    if (route.request().method() === 'GET') {
      await options.checkGate;
      return route.fulfill({ json: { hasProject: false, isLoggedIn: Boolean(owner), revision: null } });
    }
    if (route.request().method() === 'DELETE') calls.deletes++;
    return route.fulfill({ json: { success: true, revision: 'test-saved' } });
  });
  await context.route('**/api/studio/project/archive', route => {
    calls.archives++;
    return route.fulfill(options.archiveFailure
      ? { status: 503, json: { error: 'No se pudo conservar el proyecto anterior.' } }
      : options.previousProject && !JSON.parse(route.request().postData()).replacePrevious
        ? { status: 409, json: { requiresConfirmation: true } }
        : { json: { success: true } });
  });
  // Seed IndexedDB outside the app so its unload autosave cannot replace the fixture.
  await page.goto(new URL('/robots.txt', baseUrl).href);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const saved = await page.evaluate(async owner => {
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    buffer.getChannelData(0).fill(0.1);
    const beat = { id: 'fixture-beat', title: 'Proyecto anterior', bpm: 120, key: 'A', scale: 'minor',
      duration: 1, buffer, artworkGradient: '', isCustomUpload: true };
    const track = { id: 'lead1', name: 'Lead 1', buffer, duration: 1, startBeatOffset: 0,
      volume: 1, pan: 0, isMuted: false, isSolo: false,
      clips: [{ id: 'fixture-take', buffer, duration: 1, startBeatOffset: 0 }],
      fx: {
        tune: { enabled: false, speed: 0, rootKey: 'A', scaleMode: 'minor', humanize: 0 },
        eq: { lowCut: false, lowCutFreq: 100, low: 0, mid: 0, high: 0 }, comp: { amount: 0 },
        saturation: { amount: 0 }, delay: { division: 'OFF', mix: 0, feedback: 0 }, reverb: { preset: 'ROOM', mix: 0 },
      } };
    const saved = await StudioTest.saveStudioSession([track], beat,
      { enabled: true, bars: 4, startBar: 1, startSec: 0.25, endSec: 0.75 }, 0.5, 1, 'editor', owner,
      undefined, 'fixture-project');
    await ctx.close();
    return saved;
  }, owner);
  assert(saved, 'fixture must commit to IndexedDB');
  await page.goto(baseUrl);
  await page.getByText('¿Cómo deseas comenzar?', { exact: true }).waitFor();
  return { context, page, calls, errors, owner };
}

async function snapshot({ page, owner }, slot = 'active') {
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return page.evaluate(async ({ owner, slot }) => {
    const ctx = new AudioContext();
    const session = await StudioTest.restoreLastStudioSession(ctx, owner, slot);
    await ctx.close();
    return { projectId: session?.projectId, takes: session?.tracks.flatMap(track => track.clips || []).length,
      currentTime: session?.currentTime, loopEnabled: session?.loopSettings?.enabled };
  }, { owner, slot });
}

try {
  const guest = await fixture();
  const cancellation = guest.page.waitForEvent('dialog');
  const cancelledClick = guest.page.getByRole('button', { name: /Nuevo Proyecto/ }).click();
  const cancellationDialog = await cancellation;
  assert.equal(cancellationDialog.message(), '¿Nuevo proyecto? El actual se conservará como anterior.');
  await cancellationDialog.dismiss();
  await cancelledClick;
  assert(await guest.page.getByText('¿Cómo deseas comenzar?', { exact: true }).isVisible());
  assert.equal((await snapshot(guest)).takes, 1, 'cancel must keep the voice');
  guest.page.once('dialog', dialog => dialog.accept());
  await guest.page.getByRole('button', { name: /Nuevo Proyecto/ }).click();
  await guest.page.getByText('ESPACIO FÍSICO DE BEATS', { exact: true }).waitFor();
  assert.equal(await guest.page.getByText('¿Cómo deseas comenzar?', { exact: true }).count(), 0);
  await guest.page.getByRole('button', { name: 'Demo', exact: true }).click();
  await guest.page.getByText('Midnight 808', { exact: true }).click();
  await guest.page.getByRole('button', { name: 'Edición', exact: true }).click();
  assert.equal(await guest.page.locator('[data-clip-item]').count(), 0, 'new workspace must have no voices');
  await guest.page.getByText('Copia local guardada', { exact: false }).waitFor();
  const clean = await snapshot(guest);
  assert.notEqual(clean.projectId, 'fixture-project', 'new workspace must have a new identity');
  assert.equal(clean.takes, 0);
  assert.equal(clean.currentTime, 0);
  assert.equal(clean.loopEnabled, false);
  await guest.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
  await guest.page.getByRole('button', { name: 'Nuevo Proyecto', exact: true }).click();
  await guest.page.getByText('ESPACIO FÍSICO DE BEATS', { exact: true }).waitFor();
  assert.deepEqual(guest.errors, []);
  await guest.context.close();

  let releaseCheck;
  const checkGate = new Promise(resolve => { releaseCheck = resolve; });
  const account = await fixture('new-project@example.test', { checkGate });
  account.page.once('dialog', async dialog => {
    assert.equal(dialog.message(), '¿Nuevo proyecto? El actual se conservará como anterior.');
    await dialog.accept();
  });
  await account.page.getByRole('button', { name: /Nuevo Proyecto/ }).click();
  await account.page.getByRole('dialog', { name: 'Creando proyecto' }).waitFor();
  assert.equal(account.calls.deletes, 0, 'must wait for the pending account check');
  releaseCheck();
  await account.page.getByText('ESPACIO FÍSICO DE BEATS', { exact: true }).waitFor();
  assert.equal(account.calls.archives, 1);
  assert.equal(account.calls.deletes, 1);
  assert.deepEqual(account.errors, []);
  await account.context.close();

  const failed = await fixture('failed-project@example.test', { archiveFailure: true });
  failed.page.once('dialog', dialog => dialog.accept());
  await failed.page.getByRole('button', { name: /Nuevo Proyecto/ }).click();
  await failed.page.getByText('No se pudo conservar el proyecto anterior.', { exact: true }).waitFor();
  await failed.page.getByText('ESPACIO FÍSICO DE BEATS', { exact: true }).waitFor();
  assert.equal((await snapshot(failed, 'previous')).takes, 1, 'archive failure must keep local audio in the previous slot');
  assert.equal(failed.calls.deletes, 0);
  assert.deepEqual(failed.errors, []);
  await failed.context.close();

  const previous = await fixture('previous-project@example.test', { previousProject: true });
  let dialogs = 0;
  previous.page.on('dialog', async dialog => {
    if (++dialogs === 1) await dialog.accept();
    else {
      assert.equal(dialog.message(), 'Se reemplazará el proyecto anterior. ¿Continuar?');
      await dialog.dismiss();
    }
  });
  await previous.page.getByRole('button', { name: /Nuevo Proyecto/ }).click();
  await previous.page.getByRole('dialog', { name: 'Creando proyecto' }).waitFor({ state: 'hidden' });
  assert.equal(dialogs, 2);
  assert.equal(previous.calls.deletes, 0);
  assert.equal((await snapshot(previous)).takes, 1, 'cancelling archive replacement must keep the voice');
  assert.deepEqual(previous.errors, []);
  await previous.context.close();
  console.log('New project tests passed: startup, menu, minimal confirmation, cancel, clean persistence, pending account check, archive failure and archive replacement cancel.');
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) console.error('Page at failure:', (await page.locator('body').innerText()).slice(0, 4000));
  }
  throw error;
} finally {
  await browser.close();
}
