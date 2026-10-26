// Built app, isolated browser storage and synthetic audio. No real account/data writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3104';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const {chromium} = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const bundle = await build({stdin:{resolveDir:process.cwd(),contents:`
  export * from './lib/studio/audio/sessionStorage';
  export * from './lib/studio/audio/userFXTemplates';
`},bundle:true,write:false,platform:'browser',format:'iife',globalName:'EntryTest'});
const browser = await chromium.launch({channel:'chrome',headless:true});
const guide = page => page.getByRole('dialog',{name:'Instala RGodbeat Studio'});
const library = page => page.getByRole('dialog',{name:'Biblioteca de beats'});
async function fixture({standalone=false,legacy=false}={}) {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await context.addInitScript(({standalone,legacy})=>{
    if(standalone) Object.defineProperty(navigator,'standalone',{value:true});
    if(legacy) localStorage.setItem('rgodbeat_install_prompt_seen','true');
  },{standalone,legacy});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/studio/access',r=>r.fulfill({json:{isLoggedIn:false,isDemo:true,hasActivePass:false,email:null}}));
  await context.route('**/api/beats/ranking',r=>r.fulfill({json:{beats:[]}}));
  return {context,page,errors};
}
try {
  for(const fromHome of [false,true]) {
    const {context,page,errors}=await fixture();
    try {
      await page.goto(base+(fromHome?'/':'/studio'));
      if(fromHome) await page.getByRole('button',{name:'Instalar RGODBEAT Studio',exact:true}).click();
      await guide(page).waitFor();
      assert.equal(await library(page).count(),0,'tutorial and beats never overlap');
      await guide(page).getByRole('button',{name:'ENTENDIDO',exact:true}).click();
      await library(page).waitFor();
      assert.equal(new URL(page.url()).pathname,'/studio');
      assert.equal(await guide(page).count(),0);
      assert.equal(await page.getByRole('button',{name:/Continuar Sesión/}).count(),0);
      assert.equal(await page.evaluate(()=>localStorage.getItem('rgodbeat_install_guide_hidden_v2')),'true');
      await page.reload();
      await library(page).waitFor();
      assert.equal(await guide(page).count(),0,'reload of empty project goes to beats');
      // Persistence also applies to a new window in this browser profile.
      const second=await context.newPage();await second.goto(base+'/studio');
      await library(second).waitFor();assert.equal(await guide(second).count(),0);
      await second.close();
      assert.deepEqual(errors,[]);
      console.log(`PASS entry from ${fromHome?'home':'Studio'}: one tutorial, beats, reload and new window`);
    }finally{await context.close();}
  }
  for(const option of [{standalone:true},{legacy:true}]) {
    const {context,page,errors}=await fixture(option);
    try {
      await page.goto(base+'/studio');await library(page).waitFor();
      assert.equal(await guide(page).count(),0);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${Object.keys(option)[0]}: first project goes straight to beats`);
    }finally{await context.close();}
  }
  const {context,page,errors}=await fixture();
  try {
    await page.goto(base+'/robots.txt');await page.addScriptTag({content:bundle.outputFiles[0].text});
    const expected=await page.evaluate(async()=>{
      const ctx=new AudioContext();
      try {
        const buffer=ctx.createBuffer(1,48000,48000);buffer.getChannelData(0).fill(.25);
        const fx={tune:{enabled:false,speed:0,rootKey:'D',scaleMode:'major',humanize:.3},
          eq:{lowCut:true,lowCutFreq:120,low:2,mid:-1,high:3},comp:{amount:.2},saturation:{amount:0},
          delay:{division:'OFF',mix:0,feedback:0},reverb:{preset:'ROOM',mix:.1}};
        const track={id:'lead1',name:'Voz conservada',clips:[{id:'take-a',buffer,duration:1,startBeatOffset:.25,isLocked:true}],
          buffer,duration:1,startBeatOffset:.25,volume:.63,pan:-.3,isMuted:true,isSolo:false,fx};
        const custom={...track,id:'custom-entry',isCustom:true,name:'Armonía',clips:[{...track.clips[0],id:'take-b'}]};
        const beat={id:'entry-beat',title:'Proyecto de entrada',bpm:120,key:'Am',scale:'minor',buffer,duration:1,artworkGradient:'',isCustomUpload:true};
        const loop={enabled:true,bars:4,startBar:0,startSec:.1,endSec:.8};
        const mix={beatFX:{lowPass:8200,highPass:105,volume:.38},isBeatMuted:true};
        if(!await EntryTest.saveStudioSession([track,custom],beat,loop,.3,.38,'editor',null,mix,'entry-project')) throw Error('Fixture failed');
        // A later channel template must not overwrite the saved project's FX.
        EntryTest.saveUserChannelFXTemplate('lead1',{...fx,eq:{...fx.eq,low:9},reverb:{preset:'ROOM',mix:.9}},null);
        return {fx,loop,mix};
      }finally{await ctx.close();}
    });
    for(let visit=0;visit<2;visit++) {
      if(visit) await page.reload();else await page.goto(base+'/studio');
      await page.locator('[data-studio-ready="true"]').waitFor();
      assert.equal(await page.getByRole('dialog').count(),0,'returning project needs no question/tutorial');
      assert.equal(await page.locator('[data-clip-item]').count(),2);
      await page.getByText('Copia local guardada',{exact:false}).first().waitFor();
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      const restored=await page.evaluate(async()=>{
        const ctx=new AudioContext();
        try {
          const s=await EntryTest.restoreLastStudioSession(ctx,null);
          const t=s.tracks.find(t=>t.id==='lead1'),custom=s.tracks.find(t=>t.id==='custom-entry');
          return {id:s.projectId,beat:s.beat.id,time:s.currentTime,view:s.activeView,loop:s.loopSettings,
            mix:{beatFX:s.beatFX,isBeatMuted:s.isBeatMuted},fx:t.fx,volume:t.volume,pan:t.pan,muted:t.isMuted,
            clip:{id:t.clips[0].id,offset:t.clips[0].startBeatOffset,frames:t.clips[0].buffer.length,
              sample:t.clips[0].buffer.getChannelData(0)[0],locked:t.clips[0].isLocked},custom:custom.clips[0].id};
        }finally{await ctx.close();}
      });
      assert.equal(restored.id,'entry-project');assert.equal(restored.beat,'entry-beat');
      assert.equal(restored.time,.3);assert.equal(restored.view,'editor');
      assert.deepEqual(restored.loop,expected.loop);assert.deepEqual(restored.mix,expected.mix);
      for(const key of ['eq','comp','delay','reverb']) assert.deepEqual(restored.fx[key],expected.fx[key]);
      assert.equal(restored.fx.tune.rootKey,'D');assert.equal(restored.volume,.63);assert.equal(restored.pan,-.3);assert.equal(restored.muted,true);
      assert.equal(restored.clip.id,'take-a');assert.equal(restored.clip.offset,.25);assert.equal(restored.clip.frames,48000);
      assert.ok(Math.abs(restored.clip.sample-.25)<.001);assert.equal(restored.clip.locked,true);assert.equal(restored.custom,'take-b');
    }
    if(process.env.STUDIO_SCREENSHOT_DIR) await page.screenshot({path:process.env.STUDIO_SCREENSHOT_DIR+'/ultimo-proyecto-directo.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS repeat entry: voices, custom track, FX, beat mix, loop, position and view preserved');
  }finally{await context.close();}
}finally{await browser.close();}
