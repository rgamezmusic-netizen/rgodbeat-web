// Isolated local UI regression. No real accounts or cloud projects are modified.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3104/studio';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium, webkit } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle = await build({ stdin: { contents: `export * from './lib/studio/audio/sessionStorage'; export * from './lib/studio/cloudProject'; export {audioBufferToWav} from './lib/studio/audio/wavEncoder';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'StudioRegression' });
const owner = 'browser-studio@example.invalid';

async function fixture(browser, { local = true, failure = false, missingVoice = false, previous = false, confirmed = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('rgodbeat_install_prompt_seen', 'true'));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/api/studio/access', route => route.fulfill({ json: {
    isLoggedIn: true, isDemo: false, hasActivePass: true, email: owner, daysRemaining: 30,
  } }));
  await context.route('**/api/beats/ranking', route => route.fulfill({ json: { beats: [] } }));
  await context.route('**/auth/v1/**', route => route.fulfill({ status: 400, json: { code: 'refresh_token_not_found', message: 'Test session is invalid' } }));
  await page.goto(new URL('/robots.txt', base).href);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const wav = await page.evaluate(async ({ local, confirmed, owner }) => {
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); buffer.getChannelData(0).fill(0.1);
    const fx = { tune: {enabled:false,speed:0,rootKey:'A',scaleMode:'minor',humanize:0},eq:{lowCut:false,lowCutFreq:100,low:0,mid:0,high:0},
      comp:{amount:0},saturation:{amount:0},delay:{division:'OFF',mix:0,feedback:0},reverb:{preset:'ROOM',mix:0} };
    const track = {id:'lead1',name:'Lead 1',clips:[{id:'current-voice',buffer,duration:1,startBeatOffset:0}],buffer,duration:1,startBeatOffset:0,volume:1,pan:0,isMuted:false,isSolo:false,fx};
    const beat = {id:'fixture-beat',title:'Current cloud project',bpm:120,key:'A',scale:'minor',buffer,duration:1,artworkGradient:'',isCustomUpload:true};
    if (local && !await StudioRegression.saveStudioSession([track],beat,undefined,0,1,'editor',owner,undefined,'current-project')) throw Error('Fixture did not commit');
    StudioRegression.setCloudProjectUser(owner);
    if (local && confirmed) StudioRegression.confirmCloudProject('current-project', 'current-1');
    const bytes = Array.from(new Uint8Array(await StudioRegression.audioBufferToWav(buffer).arrayBuffer()));
    await ctx.close(); return bytes;
  }, { local, confirmed, owner });
  const bytes = Buffer.from(wav);
  const state = { failure, posts: [], gets: 0, lostDownloads: 0, sequence: 1, sessionMissing: false,
    active: { revision: 'current-1', project: { projectId: 'current-project', savedAt: 1, beat: { id:'fixture-beat',title:'Current cloud project',bpm:120,key:'A',scale:'minor',isCustomUpload:true,customBeatKey:'beat.wav' },
      tracks: [{id:'lead1',name:'Lead 1',clips:[{id:'current-voice',storageKey:'current.wav'}, ...(missingVoice ? [{id:'lost-voice',storageKey:'lost.wav'}] : [])]}] } },
    previous: previous ? { revision: 'previous-1', project: {projectId:'previous-project',savedAt:1,beat:{id:'previous-beat',title:'Previous cloud project',bpm:100,key:'A',scale:'minor',isCustomUpload:true,customBeatKey:'previous-beat.wav'},
      tracks:[{id:'lead1',name:'Lead 1',clips:[{id:'previous-voice',storageKey:'previous.wav'}]}]} } : null,
  };
  await context.route('**/api/studio/project*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname !== '/api/studio/project') return route.fallback();
    const slot = url.searchParams.get('slot') === 'previous' ? 'previous' : 'active';
    if (request.method() === 'GET') {
      state.gets++;
      if (state.sessionMissing) return route.fulfill({json:{isLoggedIn:false,hasProject:false}});
      if (state.failure) return route.fulfill({ status: 503, json: {
        error: state.failure === 'permanent' ? 'Configuración de nube no disponible.' : 'Nube temporalmente no disponible.',
        code: state.failure === 'permanent' ? 'STORAGE_CONFIGURATION' : 'SERVICE_UNAVAILABLE', retryable: state.failure !== 'permanent',
      } });
      const selected = state[slot];
      const project = selected ? structuredClone(selected.project) : null;
      if (project?.beat) project.beat.downloadUrl = `/api/studio/project/audio?key=${project.beat.customBeatKey}`;
      for (const track of project?.tracks || []) for (const clip of track.clips) clip.downloadUrl = `/api/studio/project/audio?key=${clip.storageKey}`;
      return route.fulfill({ json: {isLoggedIn:true,ownerEmail:owner,hasProject:Boolean(project),hasActiveProject:Boolean(state.active),hasPreviousProject:Boolean(state.previous),revision:selected?.revision || null,project,slots:['active','previous'].map(id=>({slot:id,hasProject:Boolean(state[id]),revision:state[id]?.revision || null,projectId:state[id]?.project.projectId,name:state[id]?.project.projectName || state[id]?.project.beat?.title}))} });
    }
    if (request.method() === 'POST') {
      if (state.sessionMissing) return route.fulfill({status:401,json:{code:'SESSION_REQUIRED',retryable:false,error:'Inicia sesión para conectar la nube.'}});
      if (state.failure) return route.fulfill({status:503,json:{code:'SERVICE_UNAVAILABLE',retryable:true,error:'Nube temporalmente no disponible.'}});
      const form = await new Response(request.postDataBuffer(), {headers:{'content-type':request.headers()['content-type']}}).formData();
      const metadata = JSON.parse(form.get('metadata'));
      if (form.get('baseRevision') !== (state[slot]?.revision || '')) return route.fulfill({status:409,json:{error:'Revision changed',conflict:true}});
      if (metadata.beat) metadata.beat.customBeatKey = `saved-beat-${state.sequence}.wav`;
      for (const track of metadata.tracks) for (const clip of track.clips) clip.storageKey = `${clip.id}.wav`;
      state[slot] = { revision: `${slot}-${++state.sequence}`, project: metadata };
      state.posts.push({slot,projectName:metadata.projectName,projectId:metadata.projectId,clips:metadata.tracks.flatMap(track=>track.clips).map(clip=>clip.id)});
      return route.fulfill({json:{success:true,revision:state[slot].revision}});
    }
    if (request.method() === 'DELETE') { state.active=null; return route.fulfill({json:{success:true,revision:'deleted'}}); }
    return route.fallback();
  });
  await context.route('**/api/studio/project/audio?**', route => {
    if (new URL(route.request().url()).searchParams.get('key') === 'lost.wav') {
      state.lostDownloads++; return route.fulfill({status:410,json:{code:'AUDIO_LOST'}});
    }
    return route.fulfill({body:bytes,contentType:'audio/wav'});
  });
  await context.route('**/api/studio/project/archive', route => route.fulfill({status:503,json:{error:'Nube no disponible.'}}));
  await page.goto(base);
  await page.getByRole('button', { name: /Continuar Sesión/ }).waitFor();
  return {context,page,state,errors};
}
async function waitUntil(predicate, message) {
  for (let attempt=0;attempt<100;attempt++) { if (predicate()) return; await new Promise(resolve=>setTimeout(resolve,50)); }
  assert.fail(message);
}
async function acceptClick(page, locator) {
  const ready = page.waitForEvent('dialog');
  const clicked = locator.click();
  const dialog = await ready; await dialog.accept(); await clicked;
}

for (const engineName of (process.env.STUDIO_BROWSER ? [process.env.STUDIO_BROWSER] : ['chromium','webkit'])) {
  const browser = engineName==='webkit' ? await webkit.launch({headless:true}) : await chromium.launch({channel:'chrome',headless:true});
  try {
    const named = await fixture(browser,{previous:true});
    await named.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await waitUntil(()=>named.state.posts.length>0,'initial confirmed save');
    await named.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await named.page.getByRole('button',{name:'Guardar en la Nube',exact:true}).click();
    const chooser = named.page.getByRole('dialog',{name:'Guardar en la nube'});
    await chooser.getByRole('button',{name:/Espacio 2/}).waitFor();
    await chooser.getByRole('button',{name:/Espacio 2/}).click();
    await chooser.getByLabel('Nombre del proyecto').fill('Mi canción');
    assert(await chooser.getByRole('button',{name:'Eliminar y guardar',exact:true}).isDisabled());
    const untouched = structuredClone(named.state.previous);
    await chooser.getByRole('button',{name:'Cerrar guardado en nube'}).click();
    assert.deepEqual(named.state.previous,untouched,'cancel preserves occupied slot');
    await named.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await named.page.getByRole('button',{name:'Guardar en la Nube',exact:true}).click();
    await chooser.getByRole('button',{name:/Espacio 2/}).click();
    await chooser.getByLabel('Nombre del proyecto').fill('Mi canción');
    await chooser.getByRole('checkbox').check();
    await chooser.getByRole('button',{name:'Eliminar y guardar',exact:true}).click();
    await named.page.getByText('Proyecto guardado en la nube.',{exact:true}).waitFor();
    assert.equal(named.state.previous.project.projectName,'Mi canción');
    assert.equal(named.state.active.project.projectId,'current-project');
    await named.page.getByRole('button',{name:'SOLO',exact:true}).first().click();
    await waitUntil(()=>named.state.posts.filter(p=>p.slot==='previous').length>=2,'autosave named destination');
    assert.equal(named.state.posts.at(-1).projectName,'Mi canción');
    await named.page.getByText('Respaldo de cuenta actualizado',{exact:true}).waitFor();
    await named.page.reload();
    await named.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await named.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await named.page.getByRole('button',{name:'Guardar en la Nube',exact:true}).click();
    await chooser.getByLabel('Nombre del proyecto').waitFor();
    assert.equal(await chooser.getByLabel('Nombre del proyecto').inputValue(),'Mi canción');
    assert(await named.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await named.page.screenshot({path:`/private/tmp/rgodbeat-cloud-slots-${engineName}.png`,fullPage:true});
    await chooser.getByRole('button',{name:'Cerrar guardado en nube'}).click();
    assert.deepEqual(named.errors,[]); await named.context.close();
    console.log(`PASS ${engineName}: name, cancel, confirm replacement, autosave and reopen`);

    const empty = await fixture(browser,{confirmed:false});
    await empty.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await empty.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await empty.page.getByRole('button',{name:'Guardar en la Nube',exact:true}).click();
    const emptyChooser = empty.page.getByRole('dialog',{name:'Guardar en la nube'});
    await emptyChooser.getByRole('button',{name:/Espacio 2.*Vacío/}).click();
    await emptyChooser.getByLabel('Nombre del proyecto').fill('Segundo proyecto');
    assert.equal(await emptyChooser.getByRole('checkbox').count(),0);
    await emptyChooser.getByRole('button',{name:'Guardar',exact:true}).click();
    await empty.page.getByText('Proyecto guardado en la nube.',{exact:true}).waitFor();
    assert.equal(empty.state.previous.project.projectName,'Segundo proyecto');
    await empty.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await acceptClick(empty.page,empty.page.getByRole('button',{name:'Nuevo Proyecto',exact:true}));
    await empty.page.getByText('ESPACIO FÍSICO DE BEATS',{exact:true}).waitFor();
    assert(empty.state.active && empty.state.previous,'new workspace preserves both cloud slots');
    const savesBeforeNewBeat = empty.state.posts.length;
    await empty.page.getByRole('button',{name:'Demo',exact:true}).click();
    await empty.page.getByText('Midnight 808',{exact:true}).click();
    await empty.page.waitForTimeout(1200);
    assert.equal(empty.state.posts.length,savesBeforeNewBeat,'new project requires explicit cloud destination');
    assert.deepEqual(empty.errors,[]); await empty.context.close();
    console.log(`PASS ${engineName}: free slot and new project preserve both cloud saves`);

    const stale = await fixture(browser,{previous:true,confirmed:false});
    await stale.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await stale.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await stale.page.getByRole('button',{name:'Guardar en la Nube',exact:true}).click();
    const staleChooser = stale.page.getByRole('dialog',{name:'Guardar en la nube'});
    await staleChooser.getByRole('button',{name:/Espacio 2/}).click();
    await staleChooser.getByLabel('Nombre del proyecto').fill('Mi cambio');
    await staleChooser.getByRole('checkbox').check();
    stale.state.previous.revision='changed-in-another-tab';
    await staleChooser.getByRole('button',{name:'Eliminar y guardar',exact:true}).click();
    await staleChooser.getByText(/Ese espacio cambió/).waitFor();
    assert.equal(stale.state.posts.length,0);
    assert.equal(stale.state.previous.project.projectId,'previous-project');
    assert.equal(await stale.page.locator('[data-clip-item]').count(),1);
    assert.deepEqual(stale.errors,[]); await stale.context.close();
    console.log(`PASS ${engineName}: changed slot cannot be silently overwritten`);

    const unavailable = await fixture(browser,{failure:'permanent'});
    await unavailable.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await unavailable.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await unavailable.page.getByRole('button',{name:'Guardar en la Nube',exact:true}).click();
    const unavailableChooser = unavailable.page.getByRole('dialog',{name:'Guardar en la nube'});
    await unavailableChooser.getByText('Configuración de nube no disponible.',{exact:true}).waitFor();
    assert(await unavailableChooser.getByRole('button',{name:'Guardar',exact:true}).isDisabled());
    assert.equal(await unavailableChooser.getByText('Sin consultar',{exact:true}).count(),2);
    unavailable.state.failure=false;
    await unavailableChooser.getByRole('button',{name:'Reintentar conexión',exact:true}).click();
    await unavailableChooser.getByRole('button',{name:/Espacio 2.*Vacío/}).click();
    await unavailableChooser.getByRole('button',{name:'Guardar',exact:true}).click();
    await unavailable.page.getByText('Proyecto guardado en la nube.',{exact:true}).waitFor();
    assert(unavailable.state.previous);
    assert.deepEqual(unavailable.errors,[]); await unavailable.context.close();
    console.log(`PASS ${engineName}: unavailable cloud remains unknown and recovers on retry`);

    const recovered = await fixture(browser,{failure:'temporary'});
    await recovered.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await recovered.page.getByRole('button',{name:'Reintentar conexión',exact:true}).waitFor();
    recovered.state.failure=false;
    await recovered.page.getByRole('button',{name:'Reintentar conexión',exact:true}).click();
    await waitUntil(()=>recovered.state.posts.length>0,'same project must resume saving after reconnect');
    assert.equal(recovered.state.posts.at(-1).projectId,'current-project');
    assert.equal(recovered.state.posts.at(-1).clips[0],'current-voice');
    const downloaded = recovered.page.waitForEvent('download');
    await recovered.page.getByRole('button',{name:'Guardar en dispositivo',exact:true}).click();
    const download = await downloaded;
    assert(download.suggestedFilename().endsWith('.rgodbeat'));
    const stream = await download.createReadStream(), chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert(exported.sessionData.beatData.audioWavBase64);
    assert.equal(exported.sessionData.tracks.flatMap(track=>track.clips || []).length,1);
    assert(exported.sessionData.tracks.flatMap(track=>track.clips || []).every(clip=>clip.audioWavBase64));
    // Expired account session is an explicit sign-in action, not an endless retry.
    recovered.state.failure='temporary';
    await recovered.page.getByRole('button',{name:'SOLO',exact:true}).first().click();
    await recovered.page.getByRole('button',{name:'Reintentar conexión',exact:true}).waitFor();
    recovered.state.failure=false;
    recovered.state.sessionMissing=true;
    await recovered.page.getByRole('button',{name:'Reintentar conexión',exact:true}).click();
    await recovered.page.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
    assert.equal(await recovered.page.locator('[data-clip-item]').count(),1);
    await recovered.page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    await recovered.page.getByText('INICIA SESIÓN EN TU CUENTA',{exact:true}).waitFor();
    assert.deepEqual(recovered.errors,[]); await recovered.context.close();
    console.log(`PASS ${engineName}: reconnect same project and download to device`);

    const two = await fixture(browser,{previous:true});
    await two.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await waitUntil(()=>two.state.posts.length>0,'current project initial backup');
    await two.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await acceptClick(two.page,two.page.getByRole('button',{name:/Abrir espacio 2/}));
    await two.page.getByText('Proyecto recuperado.',{exact:true}).waitFor();
    await two.page.getByRole('button',{name:'SOLO',exact:true}).first().click();
    await waitUntil(()=>two.state.posts.some(post=>post.slot==='previous'),'previous project must save into previous slot');
    assert.equal(two.state.active.project.projectId,'current-project');
    assert.equal(two.state.previous.project.projectId,'previous-project');
    assert(two.state.posts.find(post=>post.slot==='previous').clips.includes('previous-voice'));
    assert.deepEqual(two.errors,[]); await two.context.close();
    console.log(`PASS ${engineName}: previous and current cloud slots stay independent`);

    const partial = await fixture(browser,{local:false,missingVoice:true});
    await partial.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await partial.page.getByText(/Se perdió audio de la nube/).waitFor();
    await partial.page.getByRole('button',{name:'Edición',exact:true}).click();
    assert.equal(await partial.page.locator('[data-clip-item]').count(),1);
    assert.equal(partial.state.lostDownloads,1,'lost clip must not be searched repeatedly');
    assert(await partial.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await partial.page.screenshot({path:`/private/tmp/rgodbeat-studio-recovery-${engineName}.png`,fullPage:true});
    assert.deepEqual(partial.errors,[]); await partial.context.close();
    console.log(`PASS ${engineName}: report lost clip and continue with recovered voice`);

    const offline = await fixture(browser,{failure:'permanent'});
    await offline.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await offline.page.getByText('Configuración de nube no disponible.',{exact:true}).waitFor();
    await offline.page.clock.install();
    const initialGets = offline.state.gets;
    await offline.page.clock.fastForward(90000);
    assert.equal(offline.state.gets,initialGets,'permanent errors cannot loop automatically');
    await offline.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await acceptClick(offline.page,offline.page.getByRole('button',{name:'Nuevo Proyecto',exact:true}));
    await offline.page.getByText('ESPACIO FÍSICO DE BEATS',{exact:true}).waitFor();
    await offline.page.getByRole('button',{name:'Demo',exact:true}).click();
    await offline.page.getByText('Midnight 808',{exact:true}).click();
    await acceptClick(offline.page,offline.page.getByRole('button',{name:'Recuperar anterior local',exact:true}));
    await offline.page.getByText('Copia local anterior recuperada.',{exact:true}).waitFor();
    await offline.page.getByRole('button',{name:'Edición',exact:true}).click();
    assert.equal(await offline.page.locator('[data-clip-item]').count(),1);
    assert.equal(offline.state.posts.length,0);
    assert.deepEqual(offline.errors,[]); await offline.context.close();
    console.log(`PASS ${engineName}: stop permanent retry, start locally and recover previous audio`);

    const transient = await fixture(browser,{failure:'temporary'});
    await transient.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await transient.page.getByRole('button',{name:'Reintentar conexión',exact:true}).waitFor();
    await transient.page.clock.install();
    for (let attempt=0;attempt<3;attempt++) {
      const before = transient.state.gets;
      await transient.page.evaluate(() => window.dispatchEvent(new Event('online')));
      await waitUntil(()=>transient.state.gets>before,'automatic reconnect must run before consuming its retry budget');
      await transient.page.waitForFunction(() => [...document.querySelectorAll('button')].some(button=>button.textContent==='Reintentar conexión' && !button.disabled));
    }
    const limitedGets=transient.state.gets;
    await transient.page.clock.fastForward(120000);
    await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(transient.state.gets,limitedGets,'transient retries stop after their budget');
    await transient.page.getByRole('button',{name:'SOLO',exact:true}).first().click();
    await transient.page.waitForTimeout(1000);
    assert.equal(transient.state.gets,limitedGets,'editing after failed retries must not bypass the retry budget');
    assert.equal(await transient.page.locator('[data-clip-item]').count(),1);
    assert.equal(await transient.page.getByRole('button',{name:'Reintentar conexión',exact:true}).isEnabled(),true);
    assert.deepEqual(transient.errors,[]); await transient.context.close();
    console.log(`PASS ${engineName}: transient retry budget stops without losing open audio`);

    const device = await fixture(browser,{failure:'temporary'});
    await device.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await device.page.getByRole('button',{name:'Reintentar conexión',exact:true}).waitFor();
    const failedGets = device.state.gets;
    await device.page.getByRole('button',{name:'SOLO',exact:true}).first().click();
    await device.page.waitForTimeout(1000);
    assert.equal(device.state.gets,failedGets,'local edits cannot start extra cloud reconnections');
    const deviceDownload = device.page.waitForEvent('download');
    await device.page.getByRole('button',{name:'Guardar en dispositivo',exact:true}).click();
    assert((await deviceDownload).suggestedFilename().endsWith('.rgodbeat'));
    await device.page.getByText('En dispositivo · Nube pausada',{exact:true}).waitFor();
    assert.equal(await device.page.getByRole('button',{name:'Reintentar conexión',exact:true}).count(),0);
    await device.page.clock.install();
    await device.page.clock.fastForward(90000);
    assert.equal(device.state.gets,failedGets,'device work stops all automatic cloud requests');
    await device.page.reload();
    await device.page.getByRole('button',{name:/Continuar Sesión/}).click();
    await device.page.getByText('En dispositivo · Nube pausada',{exact:true}).waitFor();
    assert.equal(device.state.gets,failedGets,'the same project remembers device work after reopening');
    assert.equal(await device.page.locator('[data-clip-item]').count(),1);
    assert.equal(device.state.posts.length,0);
    await device.page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    await acceptClick(device.page,device.page.getByRole('button',{name:'Nuevo Proyecto',exact:true}));
    await device.page.getByText('ESPACIO FÍSICO DE BEATS',{exact:true}).waitFor();
    await device.page.getByRole('button',{name:'Demo',exact:true}).click();
    await device.page.getByText('Midnight 808',{exact:true}).click();
    await acceptClick(device.page,device.page.getByRole('button',{name:'Recuperar anterior local',exact:true}));
    await device.page.getByText('Copia local anterior recuperada.',{exact:true}).waitFor();
    await device.page.getByRole('button',{name:'Edición',exact:true}).click();
    assert.equal(await device.page.locator('[data-clip-item]').count(),1);
    assert.equal(device.state.gets,failedGets,'new project and local recovery must honor the paused cloud choice');
    await device.page.screenshot({path:`/private/tmp/rgodbeat-device-work-${engineName}.png`,fullPage:true});
    device.state.failure=false;
    await device.page.getByRole('button',{name:'Conectar nube',exact:true}).click();
    await waitUntil(()=>device.state.posts.length>0,'an explicit cloud connection resumes backup');
    assert.equal(device.state.posts.at(-1).projectId,'current-project');
    assert.equal(device.state.posts.at(-1).clips[0],'current-voice');
    assert.deepEqual(device.errors,[]); await device.context.close();
    console.log(`PASS ${engineName}: download pauses cloud, reopen keeps audio and manual connection resumes`);
  } finally {await browser.close();}
}
