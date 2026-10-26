// Same synthetic project, real app/audio/export, isolated profile and no remote writes.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=process.env.STUDIO_TEST_URL||'http://127.0.0.1:3104';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const {chromium}=await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './lib/studio/audio/sessionStorage';`},bundle:true,write:false,platform:'browser',format:'iife',globalName:'ModeTest'});
const owner='visual-modes@example.invalid';
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
await context.addInitScript(()=>{
  localStorage.setItem('rgodbeat_install_guide_hidden_v2','true');
  const counts=window.__modeAudio={contexts:0,decode:0,buffers:0,convolvers:0,delays:0,waveshapers:0};
  const Native=window.AudioContext;
  window.AudioContext=new Proxy(Native,{construct(Target,args){
    const ctx=new Target(...args);counts.contexts++;
    for(const [method,key] of [['decodeAudioData','decode'],['createBuffer','buffers'],['createConvolver','convolvers'],['createDelay','delays'],['createWaveShaper','waveshapers']]){
      const original=ctx[method].bind(ctx);ctx[method]=(...args)=>{counts[key]++;return original(...args);};
    }
    return ctx;
  }});
});
const blocked=[];
await context.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==new URL(base).origin)return route.abort();
  if(!['GET','HEAD'].includes(req.method())){blocked.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/studio/access')return route.fulfill({json:{isLoggedIn:true,isDemo:false,hasActivePass:true,email:owner,daysRemaining:30}});
  if(url.pathname.startsWith('/api/studio/project'))return route.fulfill({status:503,json:{error:'Isolated cloud fixture',code:'SERVICE_UNAVAILABLE',retryable:false}});
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:{beats:[]}});
  return route.continue();
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
const exportedBytes=[];
const report={checkedAt:new Date().toISOString(),browser:browser.version(),physicalPhone:false,processRAMMeasured:false,scenes:[],exports:[],pcmComparisons:[],errors,blocked};
async function mode(name){
  await page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
  await page.getByRole('button',{name:'Ajustes de la app',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Ajustes de la app'});
  await dialog.getByRole('radio',{name,exact:true}).check();
  await dialog.getByRole('button',{name:'Listo',exact:true}).click();
}
async function scene(name,view){
  return page.evaluate(({name,view})=>{
    const root=document.querySelector('[data-studio-visual-mode]');
    const result={name,view,decorativeImages:root.querySelectorAll('[data-studio-decoration="collage"] img').length,
      platterShadows:root.querySelectorAll('[data-studio-decoration="platter-shadow"]').length,
      boxShadows:0,backdropBlurs:0,dropShadows:0,blurs:0,decorativeAnimations:0,waveforms:root.querySelectorAll('[data-audio-waveform]').length,
      clips:root.querySelectorAll('[data-clip-item]').length,grain:getComputedStyle(document.body,'::before').content,
      grainImage:getComputedStyle(document.body,'::before').backgroundImage,audio:{...window.__modeAudio}};
    for(const el of root.querySelectorAll('*')){
      if(!el.getClientRects().length)continue;
      const s=getComputedStyle(el);
      if(s.boxShadow!=='none')result.boxShadows++;
      if(s.backdropFilter!=='none')result.backdropBlurs++;
      if(s.filter.includes('drop-shadow('))result.dropShadows++;
      if(s.filter.includes('blur('))result.blurs++;
      if(el.matches('.animate-pulse,.animate-ping,.animate-bounce,.animate-in')&&s.animationName!=='none')result.decorativeAnimations++;
    }
    return result;
  },{name,view});
}
async function exportSong(name){
  await page.getByRole('button',{name:'EXPORTAR',exact:true}).click();
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Descargar canción',exact:true}).click();
  const download=await pending,bytes=await readFile(await download.path());
  exportedBytes.push(bytes);
  const result={name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sampleRate:bytes.readUInt32LE(24),bits:bytes.readUInt16LE(34),channels:bytes.readUInt16LE(22)};
  await page.getByRole('button',{name:'Cerrar exportación'}).click();
  return result;
}
try{
  await page.goto(base+'/robots.txt');await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(async owner=>{
    const ctx=new AudioContext();try{
      function tone(channels,hz,gain){const b=ctx.createBuffer(channels,48000*6,48000);for(let c=0;c<channels;c++){const d=b.getChannelData(c);for(let i=0;i<d.length;i++)d[i]=gain*Math.sin(2*Math.PI*hz*i/48000);}return b;}
      const buffer=tone(1,220,.09);
      const fx={tune:{enabled:false,speed:0,rootKey:'A',scaleMode:'minor',humanize:0},eq:{lowCut:true,lowCutFreq:90,low:1,mid:-1,high:2},comp:{amount:.2},saturation:{amount:.1},delay:{division:'1/8',mix:.08,feedback:.1},reverb:{preset:'PLATE',mix:.1}};
      const track={id:'lead1',name:'Voz sintética',clips:[{id:'mode-take',buffer,duration:6,startBeatOffset:0}],buffer,duration:6,startBeatOffset:0,volume:.8,pan:.1,isMuted:false,isSolo:false,fx};
      const beat={id:'mode-beat',title:'Comparación visual aislada',bpm:120,key:'Am',scale:'minor',buffer:tone(2,80,.1),duration:6,artworkGradient:'',isCustomUpload:true};
      if(!await ModeTest.saveStudioSession([track],beat,undefined,0,.65,'editor',owner,{beatFX:{lowPass:15000,highPass:30,volume:.65},isBeatMuted:false},'mode-project'))throw Error('Fixture failed');
    }finally{await ctx.close();}
  },owner);
  await page.goto(base+'/studio');await page.locator('[data-studio-ready="true"]').waitFor();
  await page.getByText('Copia local guardada',{exact:false}).first().waitFor();
  report.exports.push(await exportSong('standard'));
  report.exports.push(await exportSong('standard-repeat'));
  report.scenes.push(await scene('standard','editor'));
  await mode('Ligero');
  report.scenes.push(await scene('light','editor'));
  const standard=report.scenes[0],light=report.scenes[1];
  assert.equal(standard.decorativeImages,32);assert.equal(light.decorativeImages,0);
  assert.notEqual(standard.grain,'none');assert.equal(light.grain,'none');assert.equal(light.grainImage,'none');
  assert.ok(standard.boxShadows>0&&standard.backdropBlurs>0&&standard.dropShadows>0);
  for(const key of ['boxShadows','backdropBlurs','dropShadows','blurs','decorativeAnimations'])assert.equal(light[key],0,key);
  assert.ok(standard.waveforms>0);assert.equal(light.waveforms,standard.waveforms);assert.equal(light.clips,standard.clips);
  assert.deepEqual(light.audio,standard.audio,'mode switch must not create/decode audio or rebuild FX');
  report.exports.push(await exportSong('light'));
  // Offline Web Audio may round a few samples differently even in repeated
  // Standard renders. Require matching format/length and <= one 16-bit PCM step
  // for EVERY sample, with active EQ, compressor, saturation, delay and reverb.
  for(let n=1;n<exportedBytes.length;n++){
    const a=exportedBytes[0],b=exportedBytes[n];
    assert.deepEqual(a.subarray(0,44),b.subarray(0,44),'same WAV header and duration');
    let changedSamples=0,maxSteps=0,sumSquares=0;
    for(let i=44;i<a.length;i+=2){
      const delta=a.readInt16LE(i)-b.readInt16LE(i);
      if(delta)changedSamples++;
      maxSteps=Math.max(maxSteps,Math.abs(delta));sumSquares+=delta*delta;
    }
    const samples=(a.length-44)/2;
    report.pcmComparisons.push({against:'standard',name:report.exports[n].name,samples,changedSamples,maxSteps,rmsSteps:Math.sqrt(sumSquares/samples)});
    assert.ok(maxSteps<=1,`${report.exports[n].name}: audio exceeds one PCM quantization step`);
  }
  assert.equal(report.exports[0].sampleRate,48000);assert.equal(report.exports[0].bits,16);assert.equal(report.exports[0].channels,2);
  // Mute keeps its functional grayscale cue even though decorative shadows vanish.
  await page.getByTitle('Mute beat',{exact:true}).click();
  assert.match(await page.locator('.grayscale').first().evaluate(el=>getComputedStyle(el).filter),/grayscale/);
  await page.getByTitle('Desmutear',{exact:true}).click();
  // Loading feedback in the installation portal inherits the visual preference.
  await page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
  await page.getByRole('button',{name:'Instalar App',exact:true}).click();
  const guide=page.getByRole('dialog',{name:'Instala RGodbeat Studio'});
  assert.equal(await guide.evaluate(el=>getComputedStyle(el.parentElement).backdropFilter),'none');
  await guide.getByRole('button',{name:'Cerrar tutorial'}).click();
  for(const name of ['Estándar','Ligero']){
    await mode(name);
    await page.getByRole('button',{name:'Grabador',exact:true}).click();
    const s=await scene(name==='Ligero'?'light':'standard','recorder');report.scenes.push(s);
    assert.equal(s.platterShadows,name==='Ligero'?0:1);
    if(name==='Ligero')assert.equal(s.blurs,0);
    if(process.env.STUDIO_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.STUDIO_SCREENSHOT_DIR}/recorder-${s.name}.png`});
    await page.getByRole('button',{name:'Edición',exact:true}).click();
    if(process.env.STUDIO_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.STUDIO_SCREENSHOT_DIR}/editor-${s.name}.png`});
  }
  await page.reload();await page.locator('[data-studio-ready="true"]').waitFor();
  await page.waitForFunction(()=>document.body.dataset.studioRendering==='light');
  assert.equal(await page.locator('[data-studio-decoration="collage"]').count(),0);
  assert.equal(await page.getByRole('dialog').count(),0);
  // Real Next client navigation/back: no Studio preference leaks to the store.
  await page.goto(base+'/');
  await page.evaluate(()=>{window.__modeNavigation='same-document';});
  await page.getByRole('link',{name:'grabar en la app Studio',exact:true}).click();
  await page.locator('[data-studio-ready="true"]').waitFor();
  assert.equal(await page.evaluate(()=>window.__modeNavigation),'same-document');
  await page.waitForFunction(()=>document.body.dataset.studioRendering==='light');
  await page.goBack();await page.waitForURL(base+'/');
  await page.waitForFunction(()=>!document.body.hasAttribute('data-studio-rendering'));
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body,'::before').content),'none');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  if(process.env.STUDIO_SCREENSHOT_DIR)await writeFile(`${process.env.STUDIO_SCREENSHOT_DIR}/comparacion.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  console.log('PASS Standard/Light: actual decoration reduction, same live audio allocations/waveforms, real WAV with FX within one PCM step, mute cue, portal, persistence and store cleanup');
}finally{await context.close();await browser.close();}
