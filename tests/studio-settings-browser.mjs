// Local app with isolated IndexedDB/OPFS/Cache Storage. Never uses personal data.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const base=process.env.STUDIO_TEST_URL||'http://127.0.0.1:3104';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const {chromium}=await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './lib/studio/audio/sessionStorage';export * from './lib/studio/audio/beatStorage';`},bundle:true,write:false,format:'iife',platform:'browser',globalName:'SettingsTest'});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await context.addInitScript(()=>localStorage.setItem('rgodbeat_install_guide_hidden_v2','true'));
await context.route('**/api/studio/access',r=>r.fulfill({json:{isLoggedIn:false,isDemo:true,hasActivePass:false,email:null}}));
await context.route('**/api/beats/ranking',r=>r.fulfill({json:{beats:[]}}));
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
async function openSettings(target=page){
  await target.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
  await target.getByRole('button',{name:'Ajustes de la app',exact:true}).click();
  return target.getByRole('dialog',{name:'Ajustes de la app'});
}
try{
  await page.goto(base+'/robots.txt');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(async()=>{
    localStorage.setItem('session-sentinel','preserved');
    const ctx=new AudioContext();try{
      const buffer=ctx.createBuffer(1,480000,48000);buffer.getChannelData(0).fill(.125);
      const fx={tune:{enabled:false,speed:0,rootKey:'A',scaleMode:'minor',humanize:0},eq:{lowCut:false,lowCutFreq:80,low:0,mid:0,high:0},comp:{amount:0},saturation:{amount:0},delay:{division:'OFF',mix:0,feedback:0},reverb:{preset:'ROOM',mix:0}};
      const track={id:'lead1',name:'Voz',clips:[{id:'settings-take',buffer,duration:10,startBeatOffset:0}],buffer,duration:10,startBeatOffset:0,volume:1,pan:0,isMuted:false,isSolo:false,fx};
      const beat={id:'settings-beat',title:'Prueba de ajustes',bpm:120,key:'Am',scale:'minor',buffer,duration:10,artworkGradient:'',isCustomUpload:true};
      if(!await SettingsTest.saveBeatToDatabase(beat))throw Error('library seed');
      if(!await SettingsTest.saveStudioSession([track],beat,undefined,0,1,'editor',null,undefined,'previous-settings'))throw Error('previous seed');
      await SettingsTest.archiveSavedStudioSession(null);
      if(!await SettingsTest.saveStudioSession([track],beat,undefined,0,1,'editor',null,undefined,'current-settings'))throw Error('active seed');
      if(navigator.storage?.getDirectory){const root=await navigator.storage.getDirectory();const file=await root.getFileHandle('settings-sentinel.txt',{create:true});const out=await file.createWritable();await out.write('OPFS preserved');await out.close();}
      for(const name of ['rgodbeat-studio-ui-test','foreign-cache']){const cache=await caches.open(name);await cache.put('/settings-sentinel',new Response('cache sentinel'));}
    }finally{await ctx.close();}
  });
  await page.goto(base+'/studio');await page.locator('[data-studio-ready="true"]').waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  assert.equal(await page.locator('[data-studio-decoration="collage"] img').count(),32);
  let settings=await openSettings();
  await settings.getByRole('checkbox',{name:/Modo visual ligero/}).check();
  assert.equal(await page.locator('[data-studio-visual-mode]').getAttribute('data-studio-visual-mode'),'light');
  assert.equal(await page.locator('[data-studio-decoration="collage"]').count(),0);
  assert.equal(await settings.evaluate(el=>getComputedStyle(el.parentElement).backdropFilter),'none','light mode disables backdrop blur');
  assert.equal(await settings.evaluate(el=>getComputedStyle(el).boxShadow),'none');
  const cacheButton=settings.getByRole('button',{name:'Limpiar caché de la app',exact:true});
  await cacheButton.click();await settings.getByText(/Caché de interfaz borrada/).waitFor();
  assert.deepEqual(await page.evaluate(()=>caches.keys()),['foreign-cache']);
  assert.equal(await page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).filter(r=>new URL(r.scope).pathname==='/studio').length),1,'cleanup keeps the Studio worker registered');
  assert.equal(await page.evaluate(()=>localStorage.getItem('session-sentinel')),'preserved');
  assert.equal(await page.evaluate(()=>localStorage.getItem('rgodbeat_install_guide_hidden_v2')),'true');
  assert.equal(await page.evaluate(async()=>{if(!navigator.storage?.getDirectory)return 'unsupported';const root=await navigator.storage.getDirectory();return(await(await root.getFileHandle('settings-sentinel.txt')).getFile()).text();}),'OPFS preserved');
  await settings.getByRole('button',{name:'Cerrar ajustes'}).click();
  await page.getByRole('button',{name:'PLAY',exact:true}).click();
  settings=await openSettings();assert.equal(await settings.getByRole('button',{name:'Limpiar caché de la app',exact:true}).isDisabled(),true);
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'PAUSA',exact:true}).click();
  await page.reload();await page.locator('[data-studio-ready="true"]').waitFor();
  assert.equal(await page.getByRole('dialog').count(),0,'settings never add entry questions');
  assert.equal(await page.locator('[data-studio-visual-mode]').getAttribute('data-studio-visual-mode'),'light');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const preserved=await page.evaluate(async()=>{
    const ctx=new AudioContext();try{
      const active=await SettingsTest.restoreLastStudioSession(ctx,null),previous=await SettingsTest.restoreLastStudioSession(ctx,null,'previous');
      return {active:active.projectId,previous:previous.projectId,activeClip:active.tracks[0].clips[0].id,previousClip:previous.tracks[0].clips[0].id,
        frames:active.tracks[0].clips[0].buffer.length,sample:active.tracks[0].clips[0].buffer.getChannelData(0)[0],library:(await SettingsTest.listSavedBeats()).length};
    }finally{await ctx.close();}
  });
  assert.deepEqual(preserved,{active:'current-settings',previous:'previous-settings',activeClip:'settings-take',previousClip:'settings-take',frames:480000,sample:.125,library:1});
  const second=await context.newPage();await second.goto(base+'/studio');await second.locator('[data-studio-ready="true"]').waitFor();
  assert.equal(await second.locator('[data-studio-visual-mode]').getAttribute('data-studio-visual-mode'),'light');
  settings=await openSettings();await settings.getByRole('checkbox',{name:/Modo visual ligero/}).uncheck();
  await second.locator('[data-studio-visual-mode="standard"]').waitFor();
  await second.close();
  await page.evaluate(()=>{
    const set=Storage.prototype.setItem;
    window.restoreSettingsStorage=()=>{Storage.prototype.setItem=set;};
    Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};
  });
  await settings.getByRole('checkbox',{name:/Modo visual ligero/}).check();
  await settings.getByText(/Ajuste aplicado a esta ventana/).waitFor();
  assert.equal(await page.locator('[data-studio-visual-mode]').getAttribute('data-studio-visual-mode'),'light');
  await page.evaluate(()=>window.restoreSettingsStorage());
  await settings.getByRole('checkbox',{name:/Modo visual ligero/}).uncheck();
  await settings.getByRole('checkbox',{name:/Modo visual ligero/}).check();
  await settings.getByText('Preferencia guardada en este dispositivo.',{exact:true}).waitFor();
  for(const [width,height] of [[320,568],[390,844],[844,390],[768,1024]]){
    await page.setViewportSize({width,height});
    const fits=await settings.evaluate(dialog=>{const r=dialog.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;});
    assert.equal(fits,true,`settings fit ${width}x${height}`);
  }
  await page.setViewportSize({width:390,height:844});
  if(process.env.STUDIO_SCREENSHOT_DIR)await page.screenshot({path:process.env.STUDIO_SCREENSHOT_DIR+'/ajustes-cache-modo-visual.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS settings: owned cache only; IndexedDB active/previous/library, OPFS, session preference and audio preserved; no reload; playback guard; light mode persisted/synchronized; four mobile viewports');
  console.log(JSON.stringify(preserved));
}finally{await context.close();await browser.close();}
