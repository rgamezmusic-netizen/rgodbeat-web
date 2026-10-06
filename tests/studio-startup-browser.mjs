// Local-only regression: real UI/storage modules, isolated responses, no production writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const base = process.env.STUDIO_TEST_URL ?? 'http://127.0.0.1:3104';
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname), 'Run only against a local build.');
assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH, 'Set STUDIO_PLAYWRIGHT_PATH to an external installation.');
const { chromium, webkit } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle = await build({ stdin: { contents: `export * from './lib/studio/audio/sessionStorage'; export {AudioEngine} from './lib/studio/audio/audioEngine';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', globalName: 'StudioRegression', platform: 'browser' });
const owner = 'local-studio@example.invalid';
const catalogId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function instrumentAudio() {
  localStorage.setItem('rgodbeat_install_prompt_seen', 'true');
  window.__studioAudio = { contexts: [], resumes: 0, premature: 0, gesture: false };
  const noteGesture = event => { if (event.isTrusted) window.__studioAudio.gesture = true; };
  window.addEventListener('pointerdown', noteGesture, true);
  window.addEventListener('keydown', noteGesture, true);
  const Native = window.AudioContext || window.webkitAudioContext;
  const Wrapped = new Proxy(Native, { construct(Target, args) {
    const ctx = new Target(...args); window.__studioAudio.contexts.push(ctx);
    const resume = ctx.resume.bind(ctx);
    ctx.resume = () => {
      window.__studioAudio.resumes++;
      if (!window.__studioAudio.gesture && !navigator.userActivation?.hasBeenActive) {
        window.__studioAudio.premature++;
        return new Promise(() => {}); // Deterministic original browser startup hang.
      }
      return resume();
    };
    return ctx;
  } });
  window.AudioContext = Wrapped;
  if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
}
async function audioStats(page) {
  return page.evaluate(() => ({ contexts: window.__studioAudio.contexts.length, resumes: window.__studioAudio.resumes,
    premature: window.__studioAudio.premature, active: window.__studioAudio.contexts.filter(c => c.state !== 'closed').length }));
}
async function seed(page, account, external = false) {
  await page.goto(base + '/studio');
  await page.getByText('Midnight 808', { exact: true }).first().waitFor();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(async ({ account, catalogId, external }) => {
    const engine = new StudioRegression.AudioEngine({});
    const ctx = await engine.ensureAudioContext({ resume: false });
    const buffer = ctx.createBuffer(1, 44100, 44100);
    buffer.getChannelData(0).fill(0.02);
    const beat = { id: external ? 'external-local' : catalogId, catalogBeatId: external ? null : catalogId,
      title: 'Local saved project', bpm: 120, key: 'C', scale: 'minor', duration: 1, buffer, artworkGradient: '', isCustomUpload: external };
    const fx = { tune: {enabled:false,speed:0,rootKey:'C',scaleMode:'minor',humanize:0}, eq:{lowCut:false,lowCutFreq:80,low:0,mid:0,high:0},comp:{amount:0},saturation:{amount:0},delay:{division:'OFF',mix:0,feedback:0},reverb:{preset:'ROOM',mix:0} };
    const track = {id:'lead1',name:'Lead 1',buffer:null,clips:[{id:'local-voice',buffer,duration:1,startBeatOffset:0}],duration:1,startBeatOffset:0,volume:1,isMuted:false,isSolo:false,fx};
    if (!await StudioRegression.saveStudioSession([track], beat, undefined, 0, 1, 'studio', account, undefined, 'local-project')) throw Error('Local seed failed');
    engine.dispose();
  }, {account, catalogId, external});
}
for (const name of ['chromium', 'webkit']) {
  const browser = await (name === 'chromium' ? chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}) : webkit.launch({headless:true}));
  try {
    for (const width of [360,390,1280]) {
      const page = await browser.newPage({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768}), errors=[];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(instrumentAudio);
      let accessCalls=0;
      await page.route('**/api/studio/access', route => {accessCalls++;return route.fulfill({json:{isDemo:true,isLoggedIn:false,hasActivePass:false,email:null,daysRemaining:0}});});
      const response = await page.goto(base+'/studio'); assert.equal(response.status(),200);
      await page.getByText('Midnight 808',{exact:true}).first().waitFor();
      assert.deepEqual(await audioStats(page),{contexts:1,resumes:0,premature:0,active:1});
      assert.equal(accessCalls,1,'one initialization/access verification');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'startup fits the viewport');
      assert.equal(await page.getByTitle('Reproducir (Espacio)',{exact:true}).isVisible(),true);
      await page.getByTitle('Reproducir (Espacio)',{exact:true}).click();
      await page.getByTitle('Pausar (Espacio)',{exact:true}).waitFor();
      assert.equal((await audioStats(page)).premature,0);
      assert.ok(await page.evaluate(() => window.__studioAudio.contexts.some(c => c.state === 'running')), 'audio runs after real playback gesture');
      await page.getByTitle('Pausar (Espacio)',{exact:true}).click();
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name} ${width}px: automatic startup; one context; no premature resume; gesture playback`);
      await page.close();
    }
    const page = await browser.newPage({viewport:{width:390,height:900},isMobile:true,hasTouch:true}), errors=[];
    page.on('pageerror',e=>errors.push(e.message)); await page.addInitScript(instrumentAudio);
    let account=null, release;
    const cloudReady = new Promise(resolve=>{release=resolve;}); let writes=0, checks=0;
    await page.route('**/api/studio/access',r=>r.fulfill({json:{isDemo:!account,isLoggedIn:Boolean(account),hasActivePass:Boolean(account),email:account,daysRemaining:account?30:0}}));
    await page.route('**/api/studio/project**',async route=>{
      if (route.request().method()!=='GET') {writes++;return route.fulfill({status:409,json:{error:'Isolated test blocks cloud writes'}});}
      checks++;await cloudReady;
      return route.fulfill({json:{hasProject:true,ownerEmail:owner,revision:'local-revision',project:{savedAt:Date.now()+60000,beat:{id:'remote-project',title:'Other remote beat'},tracks:[]}}});
    });
    await seed(page,owner); account=owner;
    await page.reload();
    await page.getByRole('button',{name:/Continuar Sesión/}).waitFor();
    assert.equal(checks,1);
    assert.deepEqual(await audioStats(page),{contexts:1,resumes:0,premature:0,active:1});
    assert.ok(await page.getByText('Conectando con tu cuenta…',{exact:false}).isVisible());
    await page.getByRole('button',{name:/Continuar Sesión/}).click();
    assert.ok(await page.getByText('Local saved project',{exact:true}).first().isVisible());
    release();
    await page.getByText('Hay una copia más reciente en tu cuenta. Tu proyecto local se conserva.',{exact:false}).waitFor();
    assert.equal(writes,0,'pending/conflicting cloud verification must not overwrite a project');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const restored=await page.evaluate(async account=>{
      const e=new StudioRegression.AudioEngine({});const ctx=await e.ensureAudioContext({resume:false});
      const data=await StudioRegression.restoreLastStudioSession(ctx,account);e.dispose();
      return {catalogBeatId:data.beat.catalogBeatId,clips:data.tracks[0].clips.length,duration:data.tracks[0].clips[0].buffer.duration};
    },owner);
    assert.deepEqual(restored,{catalogBeatId:catalogId,clips:1,duration:1});
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: restored account project before slow cloud; late conflict preserves voice/canonical beat; no cloud write`);
    await page.close();
    const external=await browser.newPage();await external.addInitScript(instrumentAudio);
    await external.route('**/api/studio/access',r=>r.fulfill({json:{isDemo:true,isLoggedIn:false,hasActivePass:false,email:null}}));
    await seed(external,null,true);await external.reload();
    await external.getByRole('button',{name:/Continuar Sesión/}).waitFor();
    assert.equal((await audioStats(external)).resumes,0);
    await external.getByRole('button',{name:/Continuar Sesión/}).click();
    await external.addScriptTag({content:bundle.outputFiles[0].text});
    const data=await external.evaluate(async()=>{
      const e=new StudioRegression.AudioEngine({});const ctx=await e.ensureAudioContext({resume:false});
      const restored=await StudioRegression.restoreLastStudioSession(ctx,null);e.dispose();
      return {title:restored.beat.title,catalog:restored.beat.catalogBeatId,custom:restored.beat.isCustomUpload,clips:restored.tracks[0].clips.length};
    });
    assert.deepEqual(data,{title:'Local saved project',catalog:null,custom:true,clips:1});
    console.log(`PASS ${name}: external beat/voices restored without invented catalog identity`);
    await external.close();
    const authPage = await browser.newPage(), authErrors = [];
    authPage.on('pageerror', error => authErrors.push(error.message));
    await authPage.route('**/auth/v1/token?**', route => route.fulfill({status:400,json:{code:'invalid_credentials',message:'Invalid login credentials'}}));
    await authPage.goto(base+'/login?redirect=%2Fstudio');
    await authPage.locator('input[type=email]').fill('local@example.invalid');
    await authPage.locator('input[type=password]').fill('local-only-invalid');
    await authPage.getByRole('button',{name:'INGRESAR →',exact:true}).click();
    await authPage.getByText(/Correo o contraseña incorrectos|Credenciales incorrectas|Correo electrónico o contraseña incorrectos/).first().waitFor();
    assert.equal(await authPage.getByRole('button',{name:'INGRESAR →',exact:true}).isEnabled(),true);
    await authPage.goto(base+'/reset-password#error=access_denied&error_code=otp_expired');
    await authPage.getByText(/El enlace venció/).waitFor();
    assert.equal(await authPage.locator('input[type=password]').count(),0);
    assert.ok(!authPage.url().includes('otp_expired'));
    await authPage.route('**/api/auth/recover', route => route.fulfill({status:503,json:{error:'No pudimos conectar con el servicio de correo. Inténtalo más tarde.'}}));
    await authPage.locator('input[type=email]').fill('local@example.invalid');
    await authPage.getByRole('button',{name:'Enviar enlace de recuperación',exact:true}).click();
    await authPage.getByText('No pudimos conectar con el servicio de correo. Inténtalo más tarde.',{exact:true}).waitFor();
    assert.equal(await authPage.getByRole('button',{name:'Enviar enlace de recuperación',exact:true}).isEnabled(),true);
    assert.deepEqual(authErrors,[]);
    console.log(`PASS ${name}: failed login/recovery settle safely; expired link cannot reset; no hydration error`);
    await authPage.close();
  } finally {await browser.close();}
}
