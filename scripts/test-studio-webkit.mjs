import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
const { webkit } = await import(process.env.STUDIO_PLAYWRIGHT_PATH ? pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href : 'playwright');

async function main() {
  const output = process.env.STUDIO_TEST_OUTPUT || path.join(os.tmpdir(), 'rgodbeat-studio-qa');
  const projectFile = path.join(output, 'edited-project.rgodbeat');
  const fixture = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  const expectedClips = fixture.sessionData.tracks.flatMap(track => track.clips || []);
  const bundle = await esbuild.build({
    stdin: { contents: `export { AudioEngine } from './lib/studio/audio/audioEngine'; export { restoreLastStudioSession } from './lib/studio/audio/sessionStorage';`, resolveDir: path.resolve(import.meta.dirname, '..') },
    bundle: true, write: false, format: 'iife', globalName: 'StudioTest', platform: 'browser',
  });
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(() => localStorage.setItem('rgodbeat_install_prompt_seen', 'true'));
    await page.route('**/api/studio/access', route => route.fulfill({ json: {
      isDemo: false, hasActivePass: true, isLoggedIn: false, daysRemaining: 30, email: null,
    } }));
    await page.route('**/api/studio/project', route => route.fulfill({ json: { hasProject: false } }));
    await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000/studio');
    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    await page.getByText('Midnight 808', { exact: true }).first().waitFor();
    await page.locator('input[type="file"][accept*="rgodbeat"]').first().setInputFiles(projectFile);
    await page.getByText('Proyecto cargado con éxito desde tu dispositivo.', { exact: false }).waitFor();
    await page.locator('[data-clip-item]').last().tap();
    const box = await page.locator('[data-clip-item]').last().boundingBox();
    const ruler = await page.getByTitle('Haz clic o arrastra para mover el cursor de reproducción').first().boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.5, ruler.y + 10);
    await page.getByRole('button', { name: /Cortar en Cabezal/ }).tap();
    assert.equal(await page.locator('[data-clip-item]').count(), expectedClips.length + 1);
    await page.getByRole('button', { name: /Deshacer/ }).first().tap();
    assert.equal(await page.locator('[data-clip-item]').count(), expectedClips.length);
    await page.getByRole('button', { name: 'Recortar final', exact: true }).tap();
    await page.getByRole('button', { name: /Deshacer/ }).first().tap();
    assert.equal(await page.locator('[data-clip-item]').count(), expectedClips.length);
    const unlock = page.getByRole('button', { name: 'DESBLOQUEAR PARA MOVER', exact: true });
    if (await unlock.isVisible()) await unlock.tap();
    await page.getByLabel('Inicio (s)', { exact: true }).fill('2.321');
    await page.getByLabel('Inicio (s)', { exact: true }).press('Enter');
    assert.equal(await page.getByLabel('Inicio (s)', { exact: true }).inputValue(), '2.321');
    await page.getByRole('button', { name: /Deshacer/ }).first().tap();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(output, 'webkit-mobile-editor.png'), fullPage: true });
    await page.getByRole('button', { name: 'Recortar final', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'webkit-mobile-edit-controls.png'), fullPage: true });
    await page.getByText('Copia local guardada', { exact: false }).waitFor();
    await page.reload();
    await page.getByRole('button', { name: /Continuar Sesión/ }).tap();
    await page.getByRole('button', { name: 'Edición', exact: true }).tap();
    assert.equal(await page.locator('[data-clip-item]').count(), expectedClips.length);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const takes = []; const errors = [];
      const engine = new StudioTest.AudioEngine({
        onTimeUpdate() {}, onPlaybackEnded() {}, onCountInBeat() {}, onRecordingAborted() {},
        onError(message) { errors.push(message); },
        onRecordingFinished(id, buffer, _waveform, start) { takes.push({ id, buffer, start }); },
      });
      const ctx = await engine.ensureAudioContext();
      const local = await StudioTest.restoreLastStudioSession(ctx, null);
      const clips = local.tracks.flatMap(track => track.clips || []).map(clip => ({ id: clip.id, start: clip.startBeatOffset, length: clip.buffer.length, duration: clip.buffer.duration }));
      engine.setBeat({ id: 'webkit-test', title: 'Test', bpm: 120, key: 'A', scale: 'minor', duration: 8,
        buffer: ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate), artworkGradient: '' });
      const microphone = ctx.createMediaStreamDestination();
      const oscillator = ctx.createOscillator(); oscillator.frequency.value = 220;
      const gain = ctx.createGain(); gain.gain.value = 0.1;
      oscillator.connect(gain); gain.connect(microphone); oscillator.start();
      engine.getMicrophoneStream = async () => microphone.stream;
      const tracks = local.tracks.map(track => ({ ...track, clips: [], buffer: null, tunedBuffer: null, duration: 0 }));
      engine.seek(0, tracks);
      const started = await engine.startRecording('lead1', tracks, false);
      await sleep(650);
      const switched = await engine.switchRecordingTrack('lead2', tracks);
      await sleep(650);
      const stop = engine.stopRecording(); const secondStop = engine.stopRecording();
      engine.releaseMicrophone(); await Promise.all([stop, secondStop]);
      const recorded = takes.map(take => ({ id: take.id, start: take.start, duration: take.buffer.duration,
        peak: Math.max(...Array.from(take.buffer.getChannelData(0).subarray(0, 12000), Math.abs)) }));
      oscillator.stop(); engine.dispose();
      return { clips, recorded, started, switched, sharedStop: stop === secondStop, errors };
    });
    assert.equal(result.clips.length, expectedClips.length);
    for (const expected of expectedClips) {
      const actual = result.clips.find(clip => clip.id === expected.id);
      assert.equal(actual.start, expected.startBeatOffset);
      assert(Math.abs(actual.duration - expected.duration) < 1 / 44100, 'undo/reload keeps the complete original voice');
    }
    assert(result.started && result.switched && result.sharedStop, JSON.stringify(result));
    assert.equal(result.recorded.length, 2);
    assert(result.recorded.every(take => take.duration > 0.4 && take.peak > 0.01));
    assert(result.recorded[0].start < 1 / 44100);
    assert(Math.abs(result.recorded[1].start - result.recorded[0].duration) < 0.02, 'vocal tracks stay continuous in WebKit');
    assert.deepEqual(result.errors, []); assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'webkit-results.json'), JSON.stringify(result, null, 2));
    console.log('Studio WebKit regression tests passed:', JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
