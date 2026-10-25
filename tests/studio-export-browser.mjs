// Actual export component + project CSS, isolated engine and local API fixtures.
// Never connects to production, writes cloud projects or uploads a real video.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from '@tailwindcss/node';

assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH, 'Set STUDIO_PLAYWRIGHT_PATH to an external Playwright module.');
const { chromium, webkit } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const sources = await Promise.all(['components/studio/ExportModal.tsx', 'components/studio/StemDeliveryForm.tsx'].map(path => readFile(path, 'utf8')));
const compiler = await compile(await readFile('app/globals.css', 'utf8'), { base: `${process.cwd()}/app`, onDependency() {} });
const css = compiler.build(sources.join('\n').match(/[^\s"'`<>]+/g));
const studioLogo = await readFile('public/images/rgodbeat-studio-logo.png');
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
  import React, {useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {ExportModal} from './components/studio/ExportModal';
  const bytes=new Uint8Array(48), header=new DataView(bytes.buffer);
  for(const [offset,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']]) [...text].forEach((c,i)=>bytes[offset+i]=c.charCodeAt(0));
  header.setUint32(4,40,true);header.setUint32(16,16,true);header.setUint16(20,1,true);header.setUint16(22,1,true);header.setUint32(24,44100,true);header.setUint32(28,88200,true);header.setUint16(32,2,true);header.setUint16(34,16,true);header.setUint32(40,4,true);
  const audio=new Blob([bytes],{type:'audio/wav'});
  window.__exportFixture={renders:0,hold:false,options:[],closed:0};
  const engine={async exportMix(tracks,options){const f=window.__exportFixture;f.renders++;f.options.push(options);if(f.hold)await new Promise(resolve=>f.release=resolve);return audio;},
    async exportVocalRawStems(){return [{blob:audio,filename:'lead1.wav'}]},async exportProcessedStems(){return [{blob:audio,filename:'lead1-fx.wav'}]},async exportBeatStem(){return {blob:audio,filename:'beat.wav'}}};
  const beat={id:'local-export-fixture',catalogBeatId:'33333333-3333-4333-8333-333333333333',title:'WINGS',bpm:126,key:'F',genre:'Trap',duration:1};
  const tracks=[{id:'lead1',name:'Lead 1',buffer:{},duration:1,clips:[]}];
  function Fixture(){const [open,setOpen]=useState(true),[toast,setToast]=useState('');return <>
    <button onClick={()=>setOpen(true)}>Abrir exportación</button><output>{toast}</output>
    <ExportModal isOpen={open} onClose={()=>{window.__exportFixture.closed++;setOpen(false)}} accountArtistName="Nombre de la web" isDemo={new URLSearchParams(location.search).has('demo')} onOpenUnlockModal={()=>setToast('Activar pase')} beat={beat} tracks={tracks} engine={engine} onShowToast={setToast}/>
  </>};
  createRoot(document.getElementById('root')).render(<Fixture/>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (path === '/images/rgodbeat-studio-logo.png') { response.setHeader('content-type', 'image/png'); response.end(studioLogo); return; }
  if (path.startsWith('/api/')) { response.writeHead(500); response.end('Unmocked fixture API'); return; }
  response.setHeader('content-type', path === '/app.js' ? 'text/javascript' : path === '/app.css' ? 'text/css' : 'text/html');
  response.end(path === '/app.js' ? bundle.outputFiles[0].text : path === '/app.css' ? css : '<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const artist = { id: '11111111-1111-4111-8111-111111111111', stage_name: 'LARY', status: 'active' };
const track = { id: '22222222-2222-4222-8222-222222222222', title: 'Mi canción', beat_id: '33333333-3333-4333-8333-333333333333', status: 'draft' };
const browsers = process.env.STUDIO_BROWSER === 'webkit' ? [['webkit', webkit]] : [['chromium', chromium]];

async function fixture(browser, { width = 390, height = 844, noArtist = false, unavailable = false, authorizationExpired = false, owner = false, identityError = false, failedTrack = false, failedPublish = false, pendingLink = false, demo = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: width < 600 });
  const errors = [], requests = [], posts = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
    requests.push({path, method});
    if (method === 'POST' && !url.search) posts.push({path, body: request.postDataJSON()});
    if (path === '/api/studio/youtube/status') return route.fulfill({json:{available:!unavailable&&!authorizationExpired,connected:!unavailable,canReconnect:owner,code:authorizationExpired?'channelAuthorization':null,error:authorizationExpired?'YouTube necesita que se vuelva a autorizar el canal RGODBEAT.':unavailable?'Fixture configuration unavailable':null}});
    if (path === '/api/rg/artists') {
      if (identityError) return route.fulfill({status:503,json:{error:'No se pudo cargar tu participación.'}});
      return route.fulfill({json:{artist:method==='GET'&&noArtist?null:artist}});
    }
    if (path === '/api/rg/tracks') {
      if (method === 'POST' && failedTrack) return route.fulfill({status:503,json:{error:'No se pudo preparar tu canción para el Top.'}});
      return route.fulfill({json:method==='GET'?{tracks:[]}:{track}});
    }
    if (path === '/api/studio/youtube/upload') return route.fulfill({json:{success:true}});
    if (path === '/api/studio/youtube/publish') {
      if (failedPublish && posts.filter(item=>item.path===path).length===1) return route.fulfill({status:502,json:{error:'YouTube no terminó la publicación. Inténtalo de nuevo.'}});
      return route.fulfill({json:{success:true,videoId:'fixture-video',videoUrl:'https://www.youtube.com/watch?v=fixture-video',privacy:request.postDataJSON().privacy,rgPublicationLinked:!pendingLink}});
    }
    if (path === '/api/rg/publications') return route.fulfill({json:{linked:true}});
    return route.fulfill({status:503,json:{error:'Unexpected fixture request'}});
  });
  await page.goto(base + (demo ? '/?demo' : '/'));
  await page.getByRole('dialog').waitFor();
  return { page, errors, requests, posts };
}
async function publishForm(page, { noArtist = false } = {}) {
  await page.getByRole('button', {name:'Publicar en YouTube',exact:true}).click();
  await page.getByRole('heading', {name:'Publica y entra al Top'}).waitFor();
  if (noArtist) await page.getByLabel('Nombre artístico', {exact:true}).fill('LARY');
  else await page.waitForFunction(()=>document.querySelector('input[autocomplete="nickname"]')?.value==='LARY');
  await page.getByLabel('Título de la canción', {exact:true}).fill('Mi canción');
  await page.getByRole('checkbox').check();
}
try {
  for (const [name, launcher] of browsers) {
    const browser = await launcher.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});
    try {
      for (const [width,height] of [[320,568],[390,844],[844,390],[1280,900]]) {
        const f = await fixture(browser,{width,height});
        const dialog=f.page.getByRole('dialog');
        assert.equal(await dialog.locator('input,select,textarea').count(),0,'home has no forms');
        assert.equal(await dialog.getByText(/sidechain|24-bit|32-bit|stems|Hz|ID canónico/i).count(),0,'home hides technical information');
        assert.ok(await dialog.getByText('Premios en RG Coins',{exact:true}).isVisible());
        assert.equal(await dialog.getByText('Publica en YouTube, suma puntos para el Top 23 y compite por RG Coins.',{exact:true}).count(),0,'remove repeated explanation');
        assert.ok(await dialog.locator('[aria-hidden="true"][style*="rgodbeat-studio-logo.png"]').isVisible(),'existing Studio logo is the card backdrop');
        assert.ok(await dialog.getByRole('button',{name:'Publicar en YouTube',exact:true}).isVisible());
        assert.ok(await dialog.getByRole('button',{name:'Descargar canción',exact:true}).isVisible());
        assert.equal(f.requests.length,0,'opening export does not load hidden forms or create records');
        assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
        if (width===390 && process.env.STUDIO_SCREENSHOT_DIR) {
          await mkdir(process.env.STUDIO_SCREENSHOT_DIR,{recursive:true});
          await f.page.screenshot({path:`${process.env.STUDIO_SCREENSHOT_DIR}/exportar-movil.png`});
          assert.ok(await dialog.evaluate(el=>el.querySelector('.overflow-y-auto').scrollHeight<=el.querySelector('.overflow-y-auto').clientHeight+1),'home fits mobile without scrolling');
        }
        await f.page.getByRole('button',{name:'Más opciones',exact:true}).click();
        const download=f.page.waitForEvent('download');
        await f.page.getByRole('button',{name:'Voces sin efectos',exact:true}).click();
        assert.equal((await download).suggestedFilename(),'lead1.wav');
        await f.page.getByRole('button',{name:'Volver a exportar',exact:true}).click();
        const song=f.page.waitForEvent('download');
        await f.page.getByRole('button',{name:'Descargar canción',exact:true}).click();
        assert.equal((await song).suggestedFilename(),'RGODBEAT_WINGS.wav');
        await f.page.getByRole('button',{name:'Cerrar exportación'}).click();
        await f.page.getByRole('button',{name:'Abrir exportación'}).click();
        assert.ok(await f.page.getByRole('button',{name:'Publicar en YouTube',exact:true}).isVisible(),'reopen returns home');
        assert.deepEqual(f.errors,[]);await f.page.close();
        console.log(`PASS ${name} ${width}x${height}: minimal home, rewards, download, more options, reopen, no overflow/runtime errors`);
      }
      const automatic=await fixture(browser,{noArtist:true});
      await automatic.page.getByRole('button',{name:'Publicar en YouTube',exact:true}).click();
      const automaticArtist=automatic.page.getByLabel('Nombre artístico',{exact:true});
      const automaticTitle=automatic.page.getByLabel('Título de la canción',{exact:true});
      assert.equal(await automaticArtist.inputValue(),'Nombre de la web','prefill the existing website name without requiring an RG artist');
      assert.equal(await automaticTitle.inputValue(),'WINGS x Nombre de la web | TOP 23 Prod RGodbeat');
      await automaticArtist.fill('LARY');
      assert.equal(await automaticTitle.inputValue(),'WINGS x LARY | TOP 23 Prod RGodbeat','automatic title follows the artist');
      await automatic.page.getByText('Portada y más opciones',{exact:true}).click();
      const description=automatic.page.getByLabel('Descripción del vídeo',{exact:true});
      assert.match(await description.inputValue(),/Artista: LARY/);
      assert.match(await description.inputValue(),/#RGodbeat #RGodbeatStudio #Top23 #RGCoins/);
      assert.match(await description.inputValue(),/https:\/\/www\.rgodbeat\.com\/ranking\/season/);
      await automaticTitle.fill('Título personalizado'); await description.fill('Descripción personalizada');
      await automaticArtist.fill('LARY 2');
      assert.equal(await automaticTitle.inputValue(),'Título personalizado','preserve manual edits');
      assert.equal(await description.inputValue(),'Descripción personalizada');
      await automatic.page.getByRole('button',{name:'Restaurar título y descripción automáticos'}).click();
      assert.equal(await automaticTitle.inputValue(),'WINGS x LARY 2 | TOP 23 Prod RGodbeat');
      assert.match(await description.inputValue(),/Artista: LARY 2/);
      await automatic.page.getByRole('checkbox').check();
      await automatic.page.getByRole('button',{name:'Publicar y participar',exact:true}).click();
      await automatic.page.getByRole('heading',{name:'Tu vídeo está en YouTube'}).waitFor();
      assert.ok(await automatic.page.getByText('Carga completada y confirmada por YouTube.',{exact:true}).isVisible());
      const automaticPublished=automatic.posts.find(item=>item.path.endsWith('/publish')).body;
      assert.equal(automaticPublished.artistName,'LARY 2');
      assert.equal(automaticPublished.videoTitle,'WINGS x LARY 2 | TOP 23 Prod RGodbeat');
      assert.match(automaticPublished.videoDescription,/14 días/);
      assert.deepEqual(automatic.errors,[]);await automatic.page.close();
      console.log(`PASS ${name}: website-name fallback, automatic metadata, editable overrides, restore defaults, confirmed completion`);

      const fresh=await fixture(browser,{noArtist:true,pendingLink:true});
      await publishForm(fresh.page,{noArtist:true});
      assert.equal(fresh.posts.length,0,'filling form must not create identities');
      if(process.env.STUDIO_SCREENSHOT_DIR)await fresh.page.screenshot({path:`${process.env.STUDIO_SCREENSHOT_DIR}/youtube-movil.png`});
      await fresh.page.evaluate(()=>{window.__exportFixture.hold=true});
      await fresh.page.getByRole('button',{name:'Publicar y participar',exact:true}).click();
      await fresh.page.waitForFunction(()=>window.__exportFixture.renders===1);
      assert.ok(await fresh.page.getByRole('button',{name:'Cerrar exportación'}).isDisabled());
      assert.ok(await fresh.page.getByRole('button',{name:'Volver a exportar'}).isDisabled());
      await fresh.page.keyboard.press('Escape');assert.ok(await fresh.page.getByRole('dialog').isVisible());
      await fresh.page.evaluate(()=>window.__exportFixture.release());
      await fresh.page.getByRole('heading',{name:'Tu vídeo está en YouTube'}).waitFor();
      const published=fresh.posts.find(item=>item.path.endsWith('/publish')).body;
      assert.deepEqual(published.rgLink,{artistId:artist.id,trackId:track.id,beatId:track.beat_id});
      assert.equal(published.privacy,'unlisted','do not silently make a video public');
      assert.equal(published.hasRights,true);assert.equal(published.madeForKids,false);
      assert.equal(fresh.posts.filter(item=>item.path==='/api/rg/artists').length,1);
      assert.equal(fresh.posts.filter(item=>item.path==='/api/rg/tracks').length,1);
      await fresh.page.getByRole('button',{name:'Reintentar participación'}).click();
      await fresh.page.getByText('Tu publicación quedó vinculada al Top 23.',{exact:true}).waitFor();
      assert.equal(fresh.posts.filter(item=>item.path.endsWith('/publish')).length,1,'retry participation never reuploads video');
      assert.equal(await fresh.page.getByRole('button',{name:'Publicar y participar',exact:true}).count(),0,'confirmed upload replaces form');
      assert.equal(await fresh.page.getByText(/coins acreditad|puntos acreditad/i).count(),0,'no unverified rewards credited');
      assert.deepEqual(fresh.errors,[]);await fresh.page.close();
      console.log(`PASS ${name}: single form creates participation only on submit, preserves RG link, busy lock, verified success and independent link retry`);

      const retry=await fixture(browser,{failedPublish:true});await publishForm(retry.page);
      await retry.page.getByLabel('Visibilidad',{exact:true}).selectOption('public');
      await retry.page.getByRole('button',{name:'Publicar y participar',exact:true}).click();
      await retry.page.getByRole('alert').getByText('YouTube no terminó la publicación. Inténtalo de nuevo.',{exact:true}).waitFor();
      assert.equal(await retry.page.getByRole('heading',{name:'Tu vídeo está en YouTube'}).count(),0);
      await retry.page.getByRole('button',{name:'Publicar y participar',exact:true}).click();
      await retry.page.getByRole('heading',{name:'Tu vídeo está en YouTube'}).waitFor();
      assert.equal(retry.posts.filter(item=>item.path==='/api/rg/tracks').length,1,'retry reuses prepared track');
      assert.equal(retry.posts.filter(item=>item.path.endsWith('/publish')).at(-1).body.privacy,'public');
      assert.deepEqual(retry.errors,[]);await retry.page.close();
      console.log(`PASS ${name}: failed upload keeps form and error, retry reuses participation, privacy choice preserved`);

      for(const options of [{unavailable:true},{authorizationExpired:true},{identityError:true},{failedTrack:true}]) {
        const f=await fixture(browser,options);await publishForm(f.page,{noArtist:true});
        if(options.failedTrack) await f.page.getByRole('button',{name:'Publicar y participar',exact:true}).click();
        await f.page.getByRole('alert').waitFor();
        if(options.authorizationExpired)assert.ok(await f.page.getByText('YouTube necesita que se vuelva a autorizar el canal RGODBEAT.',{exact:true}).isVisible());
        if(!options.failedTrack)assert.ok(await f.page.getByRole('button',{name:'Publicar y participar',exact:true}).isDisabled());
        assert.equal(f.posts.filter(item=>item.path.endsWith('/publish')).length,0,'never publish without promised participation');
        assert.equal(await f.page.evaluate(()=>window.__exportFixture.renders),0);
        assert.deepEqual(f.errors,[]);await f.page.close();
      }
      console.log(`PASS ${name}: unavailable connection, identity failure and track failure never falsely publish or reward`);
      const owner=await fixture(browser,{authorizationExpired:true,owner:true});await publishForm(owner.page);
      assert.ok(await owner.page.getByRole('link',{name:'Volver a autorizar canal'}).isVisible());
      assert.equal(await owner.page.getByRole('link',{name:'Volver a autorizar canal'}).getAttribute('href'),'/admin/youtube');
      assert.equal(owner.posts.length,0,'reconnect guidance does not create records or change credentials');
      await owner.page.close();
      const demo=await fixture(browser,{demo:true});
      assert.ok(await demo.page.getByRole('button',{name:'Activar Studio'}).isVisible());
      assert.equal(await demo.page.getByRole('button',{name:'Publicar en YouTube',exact:true}).count(),0);
      assert.equal(demo.requests.length,0);assert.deepEqual(demo.errors,[]);await demo.page.close();
      console.log(`PASS ${name}: demo access restriction preserved`);
    } finally {await browser.close();}
  }
} finally {await new Promise(resolve=>server.close(resolve));}
