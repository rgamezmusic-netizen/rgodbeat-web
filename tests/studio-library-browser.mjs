// Real local production UI + isolated IndexedDB/Web Audio. No personal data,
// remote services, physical microphone or total-process RAM measurements.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3104';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
const {chromium} = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle = await build({stdin:{resolveDir:process.cwd(),contents:`
  export * from './lib/studio/audio/beatStorage';
  export * from './lib/studio/audio/sessionStorage';
`},bundle:true,write:false,platform:'browser',format:'iife',globalName:'LibraryTest'});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const summaries=[];
function instrument() {
  localStorage.setItem('rgodbeat_install_guide_hidden_v2','true');
  const s=window.__library={decoded:[],created:[],reads:[],sources:[],starts:0};
  const get=IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get=function(key){s.reads.push([this.name,key]);return get.call(this,key);};
  const Native=window.AudioContext;
  window.AudioContext=new Proxy(Native,{construct(Target,args){
    const ctx=new Target(...args),decode=ctx.decodeAudioData.bind(ctx),create=ctx.createBuffer.bind(ctx),source=ctx.createBufferSource.bind(ctx);
    ctx.decodeAudioData=async(...args)=>{
      const buffer=await decode(...args);
      s.decoded.push({bytes:buffer.length*buffer.numberOfChannels*4,duration:buffer.duration});
      if(s.holdNext){s.holdNext=false;await new Promise(resolve=>{s.release=()=>{s.release=null;resolve();};});}
      return buffer;
    };
    ctx.createBuffer=(...args)=>{const buffer=create(...args);s.created.push({bytes:buffer.length*buffer.numberOfChannels*4,duration:buffer.duration});return buffer;};
    ctx.createBufferSource=()=>{const node=source(),start=node.start.bind(node);node.start=(...args)=>{s.starts++;node.auditFrames=node.buffer?.length||0;return start(...args);};s.sources.push(node);return node;};
    return ctx;
  }});
}
async function fixture(seed=false) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(instrument);
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==new URL(base).origin)return route.abort();
    if(route.request().url().includes('/api/studio/access'))return route.fulfill({json:{isDemo:true,isLoggedIn:false,hasActivePass:false,email:null}});
    if(route.request().url().includes('/api/'))return route.fulfill({json:{beats:[]}});
    return route.continue();
  });
  if(seed){
    await page.goto(base+'/robots.txt');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(async()=>{
      const ctx=new AudioContext();
      try {
        const buffer=ctx.createBuffer(2,96000,48000);buffer.getChannelData(0).fill(.1);buffer.getChannelData(1).fill(.1);
        const beat=id=>({id,title:id,bpm:120,key:'Am',scale:'minor',buffer,duration:2,artworkGradient:'',isCustomUpload:true});
        for(let i=0;i<23;i++)if(!await LibraryTest.saveBeatToDatabase(beat('library-'+String(i).padStart(2,'0'))))throw Error('seed');
        const voice=ctx.createBuffer(1,48000,48000);voice.getChannelData(0).fill(.25);
        const fx={tune:{enabled:false,speed:0,rootKey:'A',scaleMode:'minor',humanize:0},eq:{lowCut:false,lowCutFreq:80,low:0,mid:0,high:0},comp:{amount:0},saturation:{amount:0},delay:{division:'OFF',mix:0,feedback:0},reverb:{preset:'ROOM',mix:0}};
        const track={id:'lead1',name:'Lead 1',buffer:voice,clips:[{id:'take',buffer:voice,duration:1,startBeatOffset:0}],fx,volume:1,pan:0,isMuted:false,isSolo:false,duration:1,startBeatOffset:0};
        if(!await LibraryTest.saveStudioSession([track],beat('archived-project'),undefined,0,1,'studio',null,undefined,'archived-project'))throw Error('archive seed');
        await LibraryTest.archiveSavedStudioSession(null);
        if(!await LibraryTest.saveStudioSession([track],beat('open-project'),undefined,0,1,'studio',null,undefined,'open-project'))throw Error('active seed');
      }finally{await ctx.close();}
    });
  }
  await page.goto(base+'/studio');
  return {context,page,errors};
}
async function library(page){
  await page.getByTitle(/Clic para cambiar beat o cargar audio/).click();
  const dialog=page.getByRole('dialog',{name:'Biblioteca de beats'});await dialog.waitFor();
  await dialog.getByRole('button',{name:/^Slots/}).click();return dialog;
}
try {
  const empty=await fixture();
  try {
    await empty.page.getByText('Selecciona un Beat',{exact:true}).waitFor();
    await empty.page.locator('[data-studio-ready="true"]').waitFor();
    assert.deepEqual(await empty.page.evaluate(()=>({created:__library.created.length,decoded:__library.decoded.length})),{created:0,decoded:0});
    const dialog=await library(empty.page);
    assert.equal(await dialog.getByRole('button',{name:'Demo',exact:true}).count(),0);
    if(process.env.STUDIO_SCREENSHOT_DIR) await empty.page.screenshot({path:process.env.STUDIO_SCREENSHOT_DIR+'/biblioteca-sin-demos.png'});
    assert.deepEqual(empty.errors,[]);
    summaries.push({case:'empty startup',decoded:0,createdAudioBuffers:0,demoTab:false});
  } finally {await empty.context.close();}

  const f=await fixture(true),{page}=f;
  try {
    await page.getByRole('button',{name:/Continuar Sesión/}).waitFor();
    const startup=await page.evaluate(()=>({decoded:__library.decoded,libraryReads:__library.reads.filter(([name])=>name==='saved_beats')}));
    assert.equal(startup.decoded.length,2);assert.deepEqual(startup.libraryReads,[]);
    assert.equal(startup.decoded.reduce((sum,b)=>sum+b.bytes,0),960000);
    await page.getByRole('button',{name:/Continuar Sesión/}).click();
    let dialog=await library(page);
    await dialog.getByText('library-22',{exact:true}).waitFor();
    if(process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({path:process.env.STUDIO_SCREENSHOT_DIR+'/biblioteca-metadatos.png'});
    assert.equal(await page.evaluate(()=>__library.decoded.length),2,'opening library adds no audio');
    await dialog.getByTitle('Escuchar beat',{exact:true}).first().click();
    await dialog.getByTitle('Detener prueba',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>__library.decoded.length),3);
    await dialog.getByRole('button',{name:'Cerrar biblioteca de beats'}).click();
    assert.equal(await page.evaluate(()=>__library.sources.filter(source=>source.auditFrames>1).every(source=>source.buffer===null)),true,'preview releases its buffer on close');

    dialog=await library(page);await page.evaluate(()=>{__library.holdNext=true;});
    await dialog.getByTitle('Escuchar beat',{exact:true}).nth(1).click();
    await page.waitForFunction(()=>typeof __library.release==='function');
    const starts=await page.evaluate(()=>__library.starts);
    await dialog.getByRole('button',{name:'Cerrar biblioteca de beats'}).click();
    await page.evaluate(()=>__library.release());await page.waitForTimeout(80);
    assert.equal(await page.evaluate(()=>__library.starts),starts,'late preview cannot start after closing');

    dialog=await library(page);await page.evaluate(()=>{__library.holdNext=true;});
    await dialog.getByRole('button',{name:'Cargar',exact:true}).nth(2).click();
    await page.waitForFunction(()=>typeof __library.release==='function');
    await dialog.getByRole('button',{name:'Cerrar biblioteca de beats'}).click();
    await page.evaluate(()=>__library.release());await page.waitForTimeout(80);
    await page.getByText('open-project',{exact:true}).first().waitFor();

    dialog=await library(page);
    await dialog.getByRole('button',{name:'Cargar',exact:true}).nth(4).click();
    await dialog.waitFor({state:'detached'});
    await page.getByText('library-04',{exact:true}).first().waitFor();
    assert.equal(await page.getByRole('dialog',{name:'Biblioteca de beats'}).count(),0);
    await page.getByTitle('Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)').click();
    page.on('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Nuevo Proyecto',exact:true}).click();
    dialog=page.getByRole('dialog',{name:'Biblioteca de beats'});await dialog.waitFor();
    await dialog.getByRole('button',{name:'Cerrar biblioteca de beats'}).click();
    await page.getByText('Selecciona un Beat',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edición',exact:true}).click();
    assert.equal(await page.locator('[data-clip-item]').count(),0,'new project does not retain previous voices');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const stored=await page.evaluate(async()=>({library:(await LibraryTest.listSavedBeats()).length,previous:await LibraryTest.hasPreviousStudioSession(null)}));
    assert.deepEqual(stored,{library:23,previous:true});assert.deepEqual(f.errors,[]);
    summaries.push({case:'23 slots and saved project',startup,previewClose:'released',latePreview:'cancelled',lateSelection:'cancelled',newProject:'empty',stored});
  } finally {await f.context.close();}
  console.log('PASS: no demos/empty startup, 23 metadata-only slots, active-only decode, one-beat preview/load, cancellation and new-project memory references; stored projects preserved.');
  console.log(JSON.stringify(summaries,null,2));
} finally {await browser.close();}
