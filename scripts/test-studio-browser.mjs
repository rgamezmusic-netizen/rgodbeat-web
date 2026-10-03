import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.STUDIO_PLAYWRIGHT_PATH ? pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href : 'playwright');
import * as esbuild from 'esbuild';
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));

async function main() {
  const output = process.env.STUDIO_TEST_OUTPUT || path.join(os.tmpdir(), 'rgodbeat-studio-qa');
  await fs.mkdir(output, { recursive: true });
  const bundle = await esbuild.build({
    stdin: {
      contents: `export { AudioEngine } from './lib/studio/audio/audioEngine'; export { saveStudioSession, restoreLastStudioSession, clearSavedStudioSession, exportProjectToDeviceFile, importProjectFromDeviceFile } from './lib/studio/audio/sessionStorage'; export { saveProjectToCloud, loadProjectFromCloud, setCloudProjectUser } from './lib/studio/cloudProject'; export { appendRecordingCheckpoint, recoverRecordingCheckpoints, retireRecordingCheckpoints } from './lib/studio/audio/recordingRecovery';`,
      resolveDir: path.resolve(scriptDirectory, '..'),
    },
    bundle: true, write: false, format: 'iife', globalName: 'StudioTest', platform: 'browser',
  });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  ] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('rgodbeat_install_prompt_seen', 'true'));
    await page.route('**/api/studio/access', route => route.fulfill({ json: {
      isDemo: false, hasActivePass: true, isLoggedIn: false, daysRemaining: 30, email: null,
    } }));
    await page.route('**/api/studio/project', route => route.fulfill({ json: { success: false, exists: false } }));
    await page.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000/studio');
    await page.getByText('Midnight 808', { exact: true }).first().waitFor();
    await page.keyboard.press('Escape');
    if (await page.getByText('¿Cómo deseas comenzar?').isVisible()) await page.getByRole('button', { name: /Nuevo Proyecto/ }).click();
    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    await page.getByRole('button', { name: /REC \(LEAD 1\)/ }).click();
    await page.waitForTimeout(4000);
    await page.getByLabel('Canal para grabar o editar').selectOption('lead2');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /DETENER \(/ }).click();
    await page.getByRole('button', { name: /REC \(LEAD 2\)/ }).waitFor();
    assert.equal(await page.locator('[data-clip-item]').count(), 2);
    await page.locator('[data-clip-item]').last().click();
    const clipBox = await page.locator('[data-clip-item]').last().boundingBox();
    const ruler = page.getByTitle('Haz clic o arrastra para mover el cursor de reproducción').first();
    const rulerBox = await ruler.boundingBox();
    await page.mouse.click(clipBox.x + clipBox.width * 0.5, rulerBox.y + 10);
    await page.getByRole('button', { name: 'Recortar inicio', exact: true }).click();
    assert.equal(await page.locator('[data-clip-item]').count(), 2);
    await page.getByRole('button', { name: /Deshacer/ }).first().click();
    await page.getByRole('button', { name: /Cortar en Cabezal/ }).click();
    assert.equal(await page.locator('[data-clip-item]').count(), 3);
    await page.getByRole('button', { name: /Deshacer/ }).first().click();
    assert.equal(await page.locator('[data-clip-item]').count(), 2);
    await page.getByRole('button', { name: 'FADERS', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'SOLO', exact: true }).count(), 6, 'one solo button per vocal track');
    await page.screenshot({ path: path.join(output, 'desktop-editor.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile-editor.png'), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'editor must fit mobile width');
    await page.getByRole('button', { name: /Mover al Cabezal/ }).scrollIntoViewIfNeeded();
    assert(await page.getByRole('button', { name: /Mover al Cabezal/ }).isVisible(), 'fine editing controls must be reachable on mobile');
    await page.screenshot({ path: path.join(output, 'mobile-edit-controls.png'), fullPage: true });

    await page.getByRole('button', { name: 'DESBLOQUEAR PARA MOVER', exact: true }).click();
    const originalOffset = await page.getByLabel('Inicio (s)', { exact: true }).inputValue();
    await page.getByLabel('Inicio (s)', { exact: true }).fill('2.123');
    await page.getByLabel('Inicio (s)', { exact: true }).press('Enter');
    assert.equal(await page.getByLabel('Inicio (s)', { exact: true }).inputValue(), '2.123');
    await page.getByRole('button', { name: /Deshacer/ }).first().click();
    assert.equal(await page.getByLabel('Inicio (s)', { exact: true }).inputValue(), originalOffset);
    await page.getByLabel('Duplicar toma a otra pista').selectOption('double');
    assert.equal(await page.locator('[data-clip-item]').count(), 3);
    await page.getByRole('button', { name: /Deshacer/ }).first().click();
    assert.equal(await page.locator('[data-clip-item]').count(), 2);
    await page.getByRole('button', { name: /Rehacer/ }).first().click();
    assert.equal(await page.locator('[data-clip-item]').count(), 3);
    await page.getByRole('button', { name: /Deshacer/ }).first().click();
    const downloadReady = page.waitForEvent('download');
    await page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await page.getByRole('button', { name: 'Descargar archivo (.rgodbeat)', exact: true }).click();
    const download = await downloadReady;
    const projectFile = path.join(output, 'edited-project.rgodbeat');
    await download.saveAs(projectFile);
    const exported = JSON.parse(await fs.readFile(projectFile, 'utf8'));
    assert.equal(exported.sessionData.tracks.flatMap(track => track.clips || []).length, 2);
    assert(exported.sessionData.beatData.audioWavBase64, 'download must contain the beat audio');
    assert(exported.sessionData.tracks.flatMap(track => track.clips || []).every(clip => clip.audioWavBase64));
    await page.reload();
    await page.getByRole('button', { name: /Continuar Sesión/ }).click();
    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    assert.equal(await page.locator('[data-clip-item]').count(), 2, 'voices survive reloading after editing and downloading');
    page.on('dialog', dialog => dialog.accept());
    await page.locator('input[type="file"][accept*="rgodbeat"]').first().setInputFiles(projectFile);
    await page.getByText('Proyecto cargado con éxito desde tu dispositivo.', { exact: false }).waitFor();
    assert.equal(await page.locator('[data-clip-item]').count(), 2, 'downloaded project reopens with all voices');
    const incomplete = structuredClone(exported);
    delete incomplete.sessionData.tracks.find(track => track.clips.length).clips[0].audioWavBase64;
    await page.locator('input[type="file"][accept*="rgodbeat"]').first().setInputFiles({
      name: 'incomplete.rgodbeat', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incomplete)),
    });
    await page.getByText('Falta audio en el archivo de proyecto.', { exact: false }).waitFor();
    assert.equal(await page.locator('[data-clip-item]').count(), 2, 'a damaged import must preserve the open voices');
    await page.reload();
    await page.getByRole('button', { name: /Continuar Sesión/ }).click();
    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    assert.equal(await page.locator('[data-clip-item]').count(), 2, 'a damaged import must preserve the local backup too');

    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const takes = [];
      const engineErrors = [];
      const engine = new StudioTest.AudioEngine({
        onTimeUpdate() {}, onPlaybackEnded() {}, onCountInBeat() {}, onRecordingAborted() {},
        onError: message => engineErrors.push(message),
        onRecordingFinished: (id, buffer, waveform, start) => takes.push({ id, buffer, start }),
      });
      const ctx = await engine.ensureAudioContext();
      const beatBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      engine.setBeat({ id: 'test', title: 'Test', bpm: 120, key: 'A', scale: 'minor', duration: 4, buffer: beatBuffer, artworkGradient: '' });
      const mic = ctx.createMediaStreamDestination();
      const oscillator = ctx.createOscillator();
      oscillator.frequency.value = 220;
      const micGain = ctx.createGain(); micGain.gain.value = 0.2;
      oscillator.connect(micGain); micGain.connect(mic); oscillator.start();
      engine.getMicrophoneStream = async () => mic.stream;
      const fx = {
        tune: { enabled: false, speed: 0, rootKey: 'A', scaleMode: 'minor', humanize: 0 },
        eq: { lowCut: false, lowCutFreq: 100, low: 0, mid: 0, high: 0 }, comp: { amount: 0 },
        saturation: { amount: 0 }, delay: { division: 'OFF', mix: 0, feedback: 0 }, reverb: { preset: 'ROOM', mix: 0 },
      };
      const tracks = ['lead1', 'lead2'].map(id => ({ id, name: id, buffer: null, clips: [], duration: 0,
        startBeatOffset: 0, volume: 1, pan: 0, isMuted: false, isSolo: false, fx }));
      engine.seek(0.5, tracks);
      const started = await engine.startRecording('lead1', tracks, false);
      await sleep(700);
      const usingWorklet = Boolean(engine.pcmRecorder);
      const switched = await engine.switchRecordingTrack('lead2', tracks);
      oscillator.frequency.value = 660;
      await sleep(900);
      const stop = engine.stopRecording();
      const duplicateStop = engine.stopRecording();
      const sharedStop = stop === duplicateStop;
      engine.releaseMicrophone();
      await Promise.all([stop, duplicateStop]);
      oscillator.stop();
      const takeInfo = takes.map(take => {
        const samples = take.buffer.getChannelData(0);
        let crossings = 0;
        for (let i = Math.round(samples.length / 2) + 1; i < samples.length; i++) {
          if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
        }
        return { id: take.id, duration: take.buffer.duration, start: take.start,
          frequency: crossings / (take.buffer.duration / 2) };
      });
      const tone = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const toneData = tone.getChannelData(0);
      for (let i = 0; i < tone.length; i++) toneData[i] = 0.2 * Math.sin(2 * Math.PI * 440 * i / ctx.sampleRate);
      const vocal = { ...tracks[0], buffer: tone, duration: 1, startBeatOffset: 0, isMuted: true,
        clips: [{ id: 'voice', buffer: tone, duration: 1, startBeatOffset: 0 }] };
      engine.seek(0, [vocal]); await engine.play([vocal]);
      await sleep(100);
      vocal.isMuted = false; engine.updateVocalFX(vocal, [vocal]);
      await sleep(150);
      const samples = new Float32Array(engine.getMasterAnalyser().fftSize);
      engine.getMasterAnalyser().getFloatTimeDomainData(samples);
      const unmutePeak = Math.max(...Array.from(samples, Math.abs));
      engine.pause();
      vocal.clips[0].startBeatOffset = 5;
      const master = await engine.exportMix([vocal], { enableSidechain: false });
      const wav = new DataView(await master.arrayBuffer());
      const exportDuration = wav.getUint32(40, true) / wav.getUint32(28, true);
      const stem = (await engine.exportVocalRawStems([vocal]))[0];
      const raw = new DataView(await stem.blob.arrayBuffer());
      const rawDuration = raw.getUint32(40, true) / raw.getUint32(28, true);
      const mix = { beatFX: { highPass: 80, lowPass: 2500, volume: 0.8 }, isBeatMuted: true };
      const saved = await StudioTest.saveStudioSession([vocal], engine.getBeat(), undefined, 0, 0.8, 'editor', 'test-local', mix);
      const restored = await StudioTest.restoreLastStudioSession(ctx, 'test-local');
      const restoredLength = restored?.tracks[0]?.clips[0]?.buffer.length;
      const mixRestored = restored?.beatFX?.lowPass === 2500 && restored?.isBeatMuted === true;
      const badVoice = { ...vocal, clips: [{ ...vocal.clips[0], buffer: null }] };
      const rejectedIncompleteSave = !(await StudioTest.saveStudioSession([badVoice], engine.getBeat(), undefined, 0, 1, 'editor', 'test-local'));
      const protectedLocal = await StudioTest.restoreLastStudioSession(ctx, 'test-local');
      const preservedCompleteSave = protectedLocal?.tracks[0]?.clips[0]?.buffer.length === restoredLength;
      const brokenBeat = { ...engine.getBeat(), buffer: { length: 10, sampleRate: ctx.sampleRate, numberOfChannels: 1,
        getChannelData() { throw new Error('Simulated failed beat encoding'); } } };
      const rejectedIncompleteExport = !(await StudioTest.exportProjectToDeviceFile([vocal], brokenBeat)).success;
      const legacyFile = new File([JSON.stringify({ format: 'RGODBEAT_PROJECT_V1', sessionData: {
        tracks: [], beatData: { id: 'test', title: 'Legacy Beat', bpm: 120, key: 'A', scale: 'minor' },
      } })], 'legacy.rgodbeat', { type: 'application/json' });
      let rejectedMissingLegacyBeat = false;
      try { await StudioTest.importProjectFromDeviceFile(legacyFile, ctx, 'legacy-project', 'legacy-test'); }
      catch { rejectedMissingLegacyBeat = true; }
      const legacyProject = await StudioTest.importProjectFromDeviceFile(legacyFile, ctx, 'legacy-project', 'legacy-test', [engine.getBeat()]);
      const matchedLegacyBeat = legacyProject.beat.id === 'test' && legacyProject.beat.buffer === engine.getBeat().buffer;
      await StudioTest.clearSavedStudioSession('legacy-test');
      const pendingSave = StudioTest.saveStudioSession([vocal], engine.getBeat(), undefined, 0, 1, 'editor', 'test-local');
      const emptySave = StudioTest.saveStudioSession([], engine.getBeat(), undefined, 0, 1, 'editor', 'test-local');
      await Promise.all([pendingSave, emptySave]);
      const emptied = await StudioTest.restoreLastStudioSession(ctx, 'test-local');
      const emptyTracks = emptied?.tracks.length;
      await StudioTest.clearSavedStudioSession('test-local');
      const nativeFetch = window.fetch;
      let cloudPayload;
      const testWav = await master.arrayBuffer();
      window.fetch = async (url, options) => {
        if (options?.method === 'POST') {
          cloudPayload = options.body;
          return Response.json({ success: true });
        }
        if (url === '/api/studio/project') return Response.json({ hasProject: true, project: {
          beat: { ...engine.getBeat(), buffer: undefined, isCustomUpload: false, downloadUrl: 'test-beat' },
          ...mix,
          tracks: [{ ...vocal, buffer: undefined, clips: [{ id: 'cloud-take', startBeatOffset: 0, duration: 6, isLocked: true, downloadUrl: 'test-voice' }] }],
        } });
        return new Response(testWav);
      };
      const cloudSave = await StudioTest.saveProjectToCloud([vocal], engine.getBeat(), undefined, mix);
      const cloudBeatStored = cloudPayload?.get('beat_custom') instanceof Blob;
      const cloudMeta = JSON.parse(cloudPayload.get('metadata'));
      const cloudMixStored = cloudMeta.beatFX?.lowPass === 2500 && cloudMeta.isBeatMuted;
      const cloudRestored = await StudioTest.loadProjectFromCloud(ctx);
      const cloudBeatRestored = Boolean(cloudRestored?.beatData?.customBeatBuffer);
      const cloudLockRestored = cloudRestored?.tracks[0]?.clips[0]?.isLocked;
      const cloudMixRestored = cloudRestored?.beatFX?.lowPass === 2500 && cloudRestored?.isBeatMuted;
      StudioTest.setCloudProjectUser('stage@example.test');
      const largeBeatBuffer = ctx.createBuffer(1, ctx.sampleRate * 20, ctx.sampleRate);
      const largeBeat = { ...engine.getBeat(), buffer: largeBeatBuffer, duration: largeBeatBuffer.duration };
      const stageChunks = [];
      let stagedCommit;
      window.fetch = async (url, options) => {
        const pathname = String(url);
        if (pathname.includes('/api/studio/project/upload')) {
          const parsed = new URL(pathname, location.origin);
          if (parsed.searchParams.get('action') === 'finish') return Response.json({ success: true,
            key: `studio/projects/stage/snapshots/${parsed.searchParams.get('uploadId')}/${parsed.searchParams.get('hash')}.wav`, hash: parsed.searchParams.get('hash') });
          stageChunks.push(options.body.size);
          return Response.json({ success: true });
        }
        if (options?.method === 'POST') { stagedCommit = options.body; return Response.json({ success: true, revision: 'stage-1' }); }
        return Response.json({ hasProject: false, ownerEmail: 'stage@example.test', revision: null });
      };
      const stagedSave = await StudioTest.saveProjectToCloud([vocal], largeBeat);
      const stagedAudio = JSON.parse(stagedCommit.get('stagedAudio'));
      const stagedDebug = { success: stagedSave.success, error: stagedSave.error, chunks: stageChunks, stagedKeys: Object.keys(stagedAudio), directBeat: Boolean(stagedCommit.get('beat_custom')), directVoice: Boolean(stagedCommit.get('clip_lead1_voice')) };
      const stagedLargeAudio = stagedSave.success && stageChunks.length === 3
        && stageChunks.every(size => size <= 2000000)
        && Boolean(stagedAudio.beat_custom?.key && stagedAudio.clip_lead1_voice?.key)
        && !stagedCommit.get('beat_custom') && !stagedCommit.get('clip_lead1_voice');
      StudioTest.setCloudProjectUser('queue@example.test');
      let releaseFirst;
      let entered;
      const firstEntered = new Promise(resolve => { entered = resolve; });
      const requests = [];
      window.fetch = async (url, options) => {
        if (options?.method !== 'POST') return Response.json({ hasProject: false, revision: null, ownerEmail: 'queue@example.test' });
        requests.push(options.body);
        const number = requests.length;
        if (number === 1) { entered(); await new Promise(resolve => { releaseFirst = resolve; }); }
        return Response.json({ success: true, revision: `queue-${number}` });
      };
      const first = StudioTest.saveProjectToCloud([{ ...vocal, volume: 1 }], engine.getBeat());
      await firstEntered;
      const middle = StudioTest.saveProjectToCloud([{ ...vocal, volume: 0.5 }], engine.getBeat());
      const latest = StudioTest.saveProjectToCloud([{ ...vocal, volume: 0.2 }], engine.getBeat());
      releaseFirst();
      const writes = await Promise.all([first, middle, latest]);
      const serialized = writes.every(write => write.success) && requests.length === 2
        && JSON.parse(requests[1].get('metadata')).tracks[0].volume === 0.2
        && requests[1].get('baseRevision') === 'queue-1';
      const unchangedAudioOmitted = !requests[1].get('beat_custom') && !requests[1].get('clip_lead1_voice');
      window.fetch = async url => url === '/api/studio/project' ? Response.json({ hasProject: true, ownerEmail: 'queue@example.test', revision: 'queue-2',
        project: { beat: null, tracks: [{ ...vocal, clips: [{ id: 'missing', downloadUrl: 'missing-voice' }] }] } }) : new Response('', { status: 404 });
      let incompleteRejected = false;
      try { await StudioTest.loadProjectFromCloud(ctx); } catch { incompleteRejected = true; }
      let lastSaveId;
      window.fetch = async (url, options) => {
        if (options?.method === 'POST') {
          lastSaveId = JSON.parse(options.body.get('metadata')).clientSaveId;
          throw new TypeError('Response lost after server committed');
        }
        return Response.json({ hasProject: true, revision: 'confirmed-after-timeout', ownerEmail: 'queue@example.test', project: { clientSaveId: lastSaveId } });
      };
      const confirmedAfterTimeout = (await StudioTest.saveProjectToCloud([vocal], engine.getBeat())).success;
      window.fetch = nativeFetch;
      engine.dispose();
      return { rejectedMissingLegacyBeat, matchedLegacyBeat, rejectedIncompleteSave, preservedCompleteSave, rejectedIncompleteExport, sharedStop, deviceProjectRoundTrip: true, stagedLargeAudio, stagedDebug, confirmedAfterTimeout, serialized, unchangedAudioOmitted, incompleteRejected, mixRestored, cloudMixStored, cloudMixRestored, cloudSave: cloudSave.success, cloudBeatStored, cloudBeatRestored, cloudLockRestored, saved, restoredLength, emptyTracks, started, switched, usingWorklet, takeInfo, unmutePeak, exportDuration, rawDuration, engineErrors };
    });
    assert(result.stagedLargeAudio && result.confirmedAfterTimeout && result.serialized && result.unchangedAudioOmitted && result.incompleteRejected, JSON.stringify({ stagedLargeAudio: result.stagedLargeAudio, stagedDebug: result.stagedDebug, confirmedAfterTimeout: result.confirmedAfterTimeout, serialized: result.serialized, unchangedAudioOmitted: result.unchangedAudioOmitted, incompleteRejected: result.incompleteRejected }));
    assert(result.mixRestored && result.cloudMixStored && result.cloudMixRestored, 'project filters and beat mute must survive save/restore');
    assert(result.cloudSave && result.cloudBeatStored && result.cloudBeatRestored && result.cloudLockRestored, 'mocked cloud save must include catalog beat audio and restore locks');
    assert(result.saved && result.restoredLength > 0 && result.emptyTracks === 0, 'save/restore must preserve edits and intentional deletions');
    assert(result.started && result.switched && result.usingWorklet, JSON.stringify(result));
    assert(result.sharedStop, 'concurrent stops share the capture finalization');
    assert(result.rejectedIncompleteSave && result.preservedCompleteSave && result.rejectedIncompleteExport, 'failed encoding must preserve the complete backup and reject incomplete exports');
    assert(result.rejectedMissingLegacyBeat && result.matchedLegacyBeat, 'legacy files require their actual beat, never an arbitrary replacement');
    assert.equal(result.takeInfo.length, 2);
    assert(result.takeInfo[0].duration > 0.5 && result.takeInfo[0].duration < 1);
    assert(result.takeInfo[1].duration > 0.7 && result.takeInfo[1].duration < 1.2);
    assert(Math.abs(result.takeInfo[0].frequency - 220) < 8);
    assert(Math.abs(result.takeInfo[1].frequency - 660) < 8, 'second take must contain only its own channel recording');
    assert(result.takeInfo[0].start > 0.45 && result.takeInfo[0].start < 0.6);
    assert(Math.abs(result.takeInfo[1].start - result.takeInfo[0].start - result.takeInfo[0].duration) < 0.02);
    assert(result.unmutePeak > 0.1, 'unmuting during playback must produce audio');
    assert.equal(result.exportDuration, 6);
    assert.equal(result.rawDuration, 6);
    assert.deepEqual(result.engineErrors, []);
    assert.deepEqual(errors, []);
    // Crash an actual recording tab: no stop callback or unload save can run.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    let account = 'recovery-a@example.test';
    let allowCloud = false;
    let deleted = false;
    let newerCloud = false;
    let cloudPosts = 0;
    let newerCloudTab;
    await context.addInitScript(() => localStorage.setItem('rgodbeat_install_prompt_seen', 'true'));
    await context.route('**/api/studio/access', async route => {
      await new Promise(resolve => setTimeout(resolve, 350));
      await route.fulfill({ json: { isDemo: false, hasActivePass: true, isLoggedIn: true, email: account, daysRemaining: 30 } });
    });
    await context.route('**/api/studio/project', async route => {
      const method = route.request().method();
      if (method === 'GET') return route.fulfill({ json: newerCloud ? {
        hasProject: true, revision: 'another-device', ownerEmail: account,
        project: { savedAt: Date.now() + 60000, beat: { title: 'Another Device Beat' }, tracks: [] },
      } : { hasProject: false, revision: deleted ? 'deleted' : null } });
      if (method === 'DELETE') { deleted = true; return route.fulfill({ json: { success: true, revision: 'deleted' } }); }
      if (route.request().frame().page() === newerCloudTab) cloudPosts++;
      return route.fulfill({ status: allowCloud ? 200 : 503, json: { success: allowCloud, revision: 'saved', error: 'Simulated offline backup' } });
    });
    const crashing = await context.newPage();
    await crashing.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000/studio');
    await crashing.getByText('Midnight 808', { exact: true }).first().waitFor();
    await crashing.getByRole('button', { name: 'Edición', exact: true }).click();
    await crashing.getByRole('button', { name: /REC \(LEAD 1\)/ }).click();
    await crashing.getByText('Voz en curso protegida en este dispositivo', { exact: false }).waitFor();
    await crashing.waitForTimeout(1200);
    const cdp = await context.newCDPSession(crashing);
    await Promise.race([cdp.send('Page.crash').catch(() => {}), new Promise(resolve => setTimeout(resolve, 1500))]);
    const recovering = await context.newPage();
    await recovering.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000/studio');
    await recovering.getByRole('button', { name: /Continuar Sesión/ }).waitFor();
    assert(await recovering.getByText('1 toma', { exact: true }).isVisible(), 'interrupted in-progress voice must be offered for recovery');
    await recovering.getByRole('button', { name: /Continuar Sesión/ }).click();
    await recovering.getByRole('button', { name: 'Edición', exact: true }).click();
    await recovering.locator('[data-clip-item]').first().waitFor();
    assert.equal(await recovering.locator('[data-clip-item]').count(), 1);
    await recovering.getByText('Copia local guardada', { exact: false }).waitFor();
    await recovering.screenshot({ path: path.join(output, 'mobile-crash-recovery.png'), fullPage: true });
    await recovering.addScriptTag({ content: bundle.outputFiles[0].text });
    const recoveredInfo = await recovering.evaluate(async () => {
      const ctx = new AudioContext();
      const a = await StudioTest.restoreLastStudioSession(ctx, 'recovery-a@example.test');
      const b = await StudioTest.restoreLastStudioSession(ctx, 'recovery-b@example.test');
      const left = await StudioTest.recoverRecordingCheckpoints('session_recovery-a@example.test', ctx, a.tracks);
      const voice = a.tracks.flatMap(track => track.clips || [])[0];
      const peak = Math.max(...Array.from(voice.buffer.getChannelData(0).subarray(0, 12000), Math.abs));
      await ctx.close();
      return { projectId: a.projectId, duration: voice.buffer.duration, peak, otherAccountEmpty: b === null, journalRetired: left.recovered === 0 };
    });
    assert(recoveredInfo.duration > 1 && recoveredInfo.peak > 0, JSON.stringify(recoveredInfo));
    assert(recoveredInfo.otherAccountEmpty && recoveredInfo.journalRetired);
    newerCloud = true;
    const withNewerCloud = await context.newPage();
    newerCloudTab = withNewerCloud;
    await withNewerCloud.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000/studio');
    await withNewerCloud.getByRole('button', { name: /Continuar Sesión/ }).waitFor();
    assert(await withNewerCloud.getByText('1 toma', { exact: true }).isVisible(), 'a newer cloud project must not discard the local voice');
    await withNewerCloud.getByRole('button', { name: /Continuar Sesión/ }).click();
    await withNewerCloud.getByRole('button', { name: 'Edición', exact: true }).click();
    assert.equal(await withNewerCloud.locator('[data-clip-item]').count(), 1);
    const postsBeforeEdit = cloudPosts;
    await withNewerCloud.getByRole('button', { name: 'SOLO', exact: true }).first().click();
    await withNewerCloud.getByText('Copia local guardada', { exact: false }).waitFor();
    await withNewerCloud.waitForTimeout(1500);
    assert.equal(cloudPosts, postsBeforeEdit, 'editing a retained local project cannot overwrite the newer account copy automatically');
    await withNewerCloud.close(); newerCloud = false;
    account = 'recovery-b@example.test';
    const secondAccount = await context.newPage();
    await secondAccount.goto(process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000/studio');
    await secondAccount.getByText('Midnight 808', { exact: true }).first().waitFor();
    assert.equal(await secondAccount.getByRole('button', { name: /Continuar Sesión/ }).count(), 0, 'delayed identity check must not restore another account');
    account = 'recovery-a@example.test';
    allowCloud = true;
    recovering.on('dialog', dialog => dialog.accept());
    await recovering.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await recovering.getByRole('button', { name: 'Nuevo Proyecto', exact: true }).click();
    await recovering.getByText('Nuevo proyecto iniciado', { exact: false }).waitFor();
    await recovering.keyboard.press('Escape');
    assert(deleted, 'new project clears the cloud slot');
    await recovering.waitForTimeout(1000);
    const cleared = await recovering.evaluate(async () => {
      const ctx = new AudioContext();
      const session = await StudioTest.restoreLastStudioSession(ctx, 'recovery-a@example.test');
      await StudioTest.appendRecordingCheckpoint('session_recovery-a@example.test', {
        projectId: 'abandoned-project', takeId: 'abandoned-take', trackId: 'lead1', start: 0,
        sampleRate: ctx.sampleRate, index: 0, samples: new Float32Array(4096),
      });
      const recovery = await StudioTest.recoverRecordingCheckpoints('session_recovery-a@example.test', ctx, session?.tracks || [], session?.projectId);
      await StudioTest.saveStudioSession(session.tracks, session.beat, undefined, 0, 1, 'editor', 'recovery-a@example.test', undefined, session.projectId);
      const afterPrune = await StudioTest.recoverRecordingCheckpoints('session_recovery-a@example.test', ctx, session.tracks);

      await ctx.close();
      return { takes: session?.tracks.flatMap(track => track.clips || []).length || 0, recovered: recovery.recovered, staleJournalCleaned: afterPrune.recovered === 0 };
    });
    assert.equal(cleared.takes, 0); assert.equal(cleared.recovered, 0); assert(cleared.staleJournalCleaned);
    Object.assign(result, { crashRecovery: recoveredInfo, newerCloudKeepsLocal: true, cleanNewProject: cleared });
    await context.close();
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log('Studio browser regression tests passed:', JSON.stringify(result));
    console.log('Screenshots and results:', output);
  } catch (error) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      console.error('Page at failure:', (await page.locator('body').innerText()).slice(0, 5000));
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    }
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
