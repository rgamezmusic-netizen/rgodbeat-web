// Local UI regression with synthetic microphone input. No production writes,
// account impersonation, autoplay override or real microphone access.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const base = process.env.STUDIO_TEST_URL ?? 'http://127.0.0.1:3104';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname));
assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const { chromium, webkit, firefox } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle = await build({ stdin: { contents: `export {restoreLastStudioSession} from './lib/studio/audio/sessionStorage';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'StudioMediaTest', platform: 'browser' });

function instrument() {
  localStorage.setItem('rgodbeat_install_prompt_seen', 'true');
  const Native = window.AudioContext || window.webkitAudioContext;
  const state = window.__mediaTest = { contexts: [], analysers: [], microphoneCalls: 0, modes: [], streams: [] };
  let mode = 'playback';
  Object.defineProperty(navigator, 'audioSession', { configurable: true, value: {
    get type() { return mode; }, set type(value) { mode = value; state.modes.push(value); },
  } });
  window.AudioContext = new Proxy(Native, { construct(Target, args) {
    const ctx = new Target(...args); state.contexts.push(ctx);
    const createAnalyser = ctx.createAnalyser.bind(ctx);
    ctx.createAnalyser = () => { const node = createAnalyser(); state.analysers.push(node); return node; };
    return ctx;
  } });
  if (window.webkitAudioContext) window.webkitAudioContext = window.AudioContext;
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => {
    state.microphoneCalls++;
    // Resolve after the REC event has bubbled to all first-gesture listeners.
    await new Promise(resolve => setTimeout(resolve, 100));
    if (mode !== 'play-and-record') throw new DOMException('Cannot connect to audio session', 'NotReadableError');
    const ctx = state.contexts[0];
    const output = ctx.createMediaStreamDestination();
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    gain.gain.value = 0.1; oscillator.frequency.value = 220;
    oscillator.connect(gain); gain.connect(output); oscillator.start();
    state.streams.push(output.stream);
    return output.stream;
  } } });
}

for (const [name, launcher] of [['chromium', chromium], ['webkit', webkit], ['firefox', firefox]]) {
  if (process.env.STUDIO_TEST_BROWSER ? process.env.STUDIO_TEST_BROWSER !== name : name === 'firefox') continue;
  const browser = await launcher.launch({ headless: true, ...(name === 'chromium' ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) });
  try {
    for (const width of process.env.STUDIO_TEST_LISTEN_ONLY ? [] : [360, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 768, ...(name !== 'firefox' ? { isMobile: width < 768 } : {}) });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(instrument);
      let cloudWrites = 0;
      await page.route('**/api/studio/access', r => r.fulfill({ json: { isDemo: false, isLoggedIn: true, hasActivePass: true, email: 'local-media@example.invalid', daysRemaining: 30 } }));
      await page.route('**/api/studio/project**', r => {
        if (r.request().method() !== 'GET') cloudWrites++;
        return r.fulfill({ status: 503, json: { error: 'No se pudo consultar el respaldo. Tu proyecto no se ha borrado.' } });
      });
      await page.goto(base + '/studio');
      await page.getByText('Midnight 808', { exact: true }).first().waitFor();
      await page.getByText('Reintentar conexión', { exact: true }).waitFor();
      // REC is the first interaction. Native Web Audio still needs that gesture.
      await page.getByTitle('Grabar en Lead 1', { exact: true }).click();
      try { await page.getByTitle('Pausar (Espacio)', { exact: true }).waitFor({timeout:10000}); }
      catch (error) {
        console.error(name, width, await page.locator('body').innerText(), await page.evaluate(() => ({modes:window.__mediaTest.modes,calls:window.__mediaTest.microphoneCalls,states:window.__mediaTest.contexts.map(c=>c.state)})));
        throw error;
      }
      await page.waitForTimeout(800);
      const active = await page.evaluate(() => {
        const s = window.__mediaTest, samples = new Float32Array(s.analysers[0].fftSize);
        s.analysers[0].getFloatTimeDomainData(samples);
        return { calls: s.microphoneCalls, modes: s.modes, state: s.contexts[0].state, peak: Math.max(...samples.map(Math.abs)) };
      });
      assert.equal(active.calls, 1); assert.equal(active.state, 'running');
      assert.equal(active.modes.at(-1), 'play-and-record');
      assert.ok(active.peak > 0.001, 'the actual beat output is audible during recording');
      await page.getByRole('button', { name: /STOP/ }).click();
      await page.getByTitle('Grabar en Lead 1', { exact: true }).waitFor();
      await page.getByText('Copia local guardada', { exact: false }).waitFor();
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.waitForFunction(async () => {
        const project = await StudioMediaTest.restoreLastStudioSession(window.__mediaTest.contexts[0], 'local-media@example.invalid');
        return project?.tracks.some(t => t.clips?.length > 0);
      });
      const saved = await page.evaluate(async () => {
        const s = window.__mediaTest;
        const project = await StudioMediaTest.restoreLastStudioSession(s.contexts[0], 'local-media@example.invalid');
        const clips = project?.tracks.flatMap(t => t.clips ?? []) ?? [];
        return { clips: clips.length, duration: clips[0]?.buffer.duration,
          peak: clips[0] ? Math.max(...clips[0].buffer.getChannelData(0).subarray(0, 12000).map(Math.abs)) : 0,
          liveMicrophones: s.streams.some(stream => stream.getTracks().some(t => t.readyState === 'live')) };
      });
      assert.equal(saved.clips, 1); assert.ok(saved.duration > 0.4); assert.ok(saved.peak > 0.01);
      assert.equal(saved.liveMicrophones, false); assert.equal(cloudWrites, 0);

      // Listening is independent of REC: isolate the saved voice, then the beat,
      // then their mix through the actual UI. None may reopen the microphone.
      await page.getByRole('button', { name: 'Edición', exact: true }).click();
      await page.getByTitle('Mostrar faders de volumen y paneo en cada pista (Vista mixer)', { exact: true }).click();
      async function listen() {
        await page.getByTitle('Ir al inicio (0:00)', { exact: true }).click();
        await page.getByRole('button', { name: 'PLAY', exact: true }).click();
        await page.getByRole('button', { name: 'PAUSA', exact: true }).waitFor();
        await page.waitForTimeout(150);
        const result = await page.evaluate(() => {
          const s = window.__mediaTest, samples = new Float32Array(s.analysers[0].fftSize);
          s.analysers[0].getFloatTimeDomainData(samples);
          return { peak: Math.max(...samples.map(Math.abs)), calls: s.microphoneCalls,
            live: s.streams.some(stream => stream.getTracks().some(t => t.readyState === 'live')) };
        });
        assert.ok(result.peak > 0.001, 'Play produces real audio without recording');
        assert.equal(result.calls, 1, 'Play must not request microphone permission');
        assert.equal(result.live, false, 'Play keeps the microphone disconnected');
        await page.getByRole('button', { name: 'PAUSA', exact: true }).click();
      }
      await page.getByTitle('Silenciar beat (Mute)', { exact: true }).click();
      await listen(); // Recorded voice only.
      await page.getByTitle('Activar beat (Desmutear)', { exact: true }).click();
      await page.getByTitle('Silenciar pista (Mute)', { exact: true }).first().click();
      await listen(); // Beat only.
      await page.getByTitle('Activar audio (Desmutear)', { exact: true }).first().click();
      await listen(); // Beat + saved voice.

      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      console.log(`PASS ${name} ${width}px: REC/save; standalone Play of voice, beat and mix; no microphone during listening; backup outage does not block audio`);
      await page.close();
    }
    const listener = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true,
      ...(name !== 'firefox' ? { isMobile: true } : {}) });
    await listener.addInitScript(instrument);
    await listener.route('**/api/studio/access', r => r.fulfill({ json: {
      isDemo: true, isLoggedIn: false, hasActivePass: false, email: null, daysRemaining: 0,
    } }));
    await listener.goto(base + '/studio');
    await listener.getByText('Midnight 808', { exact: true }).first().waitFor();
    await listener.getByTitle('Reproducir (Espacio)', { exact: true }).click();
    await listener.getByTitle('Pausar (Espacio)', { exact: true }).waitFor();
    await listener.waitForFunction(() => {
      const s = window.__mediaTest, samples = new Float32Array(s.analysers[0].fftSize);
      s.analysers[0].getFloatTimeDomainData(samples);
      return Math.max(...samples.map(Math.abs)) > 0.001;
    });
    assert.equal(await listener.evaluate(() => window.__mediaTest.microphoneCalls), 0,
      'first Play works before any recording or microphone permission');
    assert.ok(await listener.getByTitle('Grabar en Lead 1', { exact: true }).isVisible());
    await listener.getByTitle('Pausar (Espacio)', { exact: true }).click();
    console.log(`PASS ${name}: first Play produces beat audio with zero microphone requests and no recording`);
    await listener.close();
  } finally { await browser.close(); }
}
