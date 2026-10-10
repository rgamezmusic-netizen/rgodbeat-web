// Real components and SSR hydration with emulated device signals. Does not open
// external social accounts or claim to test native apps on a physical phone.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { loadSource } from './helpers/rg-fixtures.mjs';

assert.ok(process.env.STUDIO_PLAYWRIGHT_PATH);
const { chromium, webkit } = await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const { Footer } = loadSource('components/layout/Footer.tsx');
const { SocialSidebar } = loadSource('components/layout/SocialSidebar.tsx');
const { InstallAppModal } = loadSource('components/studio/InstallAppModal.tsx');
const { SOCIAL_URLS } = loadSource('lib/social-links.ts');
const rootMarkup = renderToString(React.createElement(React.Fragment, null,
  React.createElement(Footer), React.createElement(SocialSidebar),
  React.createElement('button', {id:'reopen', style:{display:'block',margin:'0 auto'}}, 'Reopen guide'),
  React.createElement(InstallAppModal, {isOpen:true, onClose:()=>{}})));
assert.ok(rootMarkup.includes(SOCIAL_URLS.youtube));
assert.ok(rootMarkup.includes(SOCIAL_URLS.discord));
assert.ok(rootMarkup.includes(SOCIAL_URLS.instagram));
assert.ok(!rootMarkup.includes('intent://'), 'SSR and no-JS visitors keep working HTTPS links');

const bundle = await build({
  stdin:{loader:'tsx', resolveDir:process.cwd(), contents:`
    import React, {useState} from 'react';
    import {hydrateRoot} from 'react-dom/client';
    import {Footer} from './components/layout/Footer';
    import {SocialSidebar} from './components/layout/SocialSidebar';
    import {InstallAppModal} from './components/studio/InstallAppModal';
    function Root(){const [open,setOpen]=useState(true);return <><Footer/><SocialSidebar/><button id="reopen" style={{display:'block',margin:'0 auto'}} onClick={()=>setOpen(true)}>Reopen guide</button><InstallAppModal isOpen={open} onClose={()=>setOpen(false)}/></>}
    window.hydrationErrors=[];
    hydrateRoot(document.getElementById('root'), <Root/>, {onRecoverableError:e=>window.hydrationErrors.push(e.message)});
  `},bundle:true, write:false, platform:'browser', format:'iife', define:{'process.env.NODE_ENV':'"development"', 'process.env':'{}'},
});
const styles = await postcss([tailwind()]).process(await readFile('app/globals.css','utf8'),{from:`${process.cwd()}/app/globals.css`});
const server = createServer(async (req,res) => {
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(styles.css);}
  else if(req.url==='/images/rgodbeat-studio-logo.png'){res.setHeader('Content-Type','image/png');res.end(await readFile('public/images/rgodbeat-studio-logo.png'));}
  else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root">${rootMarkup}</div><script src="/app.js"></script></body></html>`);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const mac='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1';
const chromeAndroid='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36';
const cases=[
  {label:'Mac · Safari', ua:mac, platform:'MacIntel', width:1280, guide:'Añadir al Dock', mobile:false},
  {label:'Mac · Chrome', ua:mac.replace('Version/17.6','Chrome/140.0.0.0'), platform:'MacIntel', width:1280, guide:'Barra de Direcciones', mobile:false},
  {label:'Windows · Edge', ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', platform:'Win32', width:1280, guide:'Barra de Direcciones', mobile:false},
  {label:'Linux · Firefox', ua:'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0', platform:'Linux x86_64', width:1280, guide:'Barra de Direcciones', mobile:false},
  {label:'iPhone · Safari', ua:iphone, platform:'iPhone', touch:5, width:390, guide:'Abre Compartir', mobile:true},
  {label:'iPhone · Chrome', ua:iphone.replace('Version/17.6','CriOS/140.0.0.0'), platform:'iPhone', touch:5, width:320, guide:'Abre Compartir', mobile:true},
  {label:'iPad · Safari', ua:mac, platform:'MacIntel', touch:5, width:820, guide:'Abre Compartir', mobile:true},
  {label:'Android · Chrome', ua:chromeAndroid, platform:'Linux armv8l', touch:5, width:390, guide:'Menú de Opciones', mobile:true, intent:true},
  {label:'Android · Firefox', ua:'Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/20100101 Firefox/140.0', platform:'Linux armv8l', touch:5, width:390, guide:'Menú de Opciones', mobile:true},
  {label:'Android · Navegador integrado', ua:chromeAndroid+' Instagram 400', platform:'Linux armv8l', touch:5, width:390, guide:'Menú de Opciones', mobile:true},
  {label:'Windows · Edge', ua:mac, platform:'MacIntel', width:1280, guide:'Barra de Direcciones', mobile:false, hints:{platform:'Windows',brands:[{brand:'Microsoft Edge',version:'140'}]}},
  {label:'Dispositivo · Navegador', ua:'unknown', platform:'unknown', width:390, guide:'Barra de Direcciones', mobile:false},
];

try {
  const name=process.env.STUDIO_TEST_BROWSER??'chromium';
  const browser=await (name==='webkit'?webkit:chromium).launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try {
    for(const device of cases){
      const context=await browser.newContext({userAgent:device.ua, viewport:{width:device.width,height:800}, hasTouch:!!device.touch, isMobile:!!device.mobile});
      await context.addInitScript(d=>{
        Object.defineProperty(navigator,'platform',{value:d.platform,configurable:true});
        Object.defineProperty(navigator,'maxTouchPoints',{value:d.touch??0,configurable:true});
        Object.defineProperty(navigator,'userAgentData',{value:d.hints,configurable:true});
        window.linkClicks=[];
        document.addEventListener('click',e=>{const a=e.target.closest('a');if(a && /^(intent:|https:)/.test(a.getAttribute('href'))){e.preventDefault();window.linkClicks.push({href:a.getAttribute('href'),target:a.target});}},true);
      },device);
      const page=await context.newPage();page.setDefaultTimeout(10000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);
      try { await page.getByText(device.label,{exact:true}).waitFor(); }
      catch(error) { throw new Error(`${device.label}: ${JSON.stringify(errors)}; ${error.message}`); }
      await page.getByRole('heading',{name:device.guide,exact:true}).waitFor();
      assert.equal(await page.getByRole('link',{name:'Descargar APK Oficial (Android)'}).count(),0);
      if(device.label==='iPhone · Chrome') await page.getByText('Abre rgodbeat.com en Safari y toca Compartir.',{exact:true}).waitFor();
      for(const service of ['instagram','youtube']){
        const title=service==='instagram'?'Instagram':'YouTube';
        for(const link of await page.getByRole('link',{name:title,exact:true,includeHidden:true}).all()){
          const href=await link.getAttribute('href');
          assert.equal(await link.getAttribute('target'),device.mobile?'_self':'_blank');
          if(device.intent){
            assert.ok(href.startsWith('intent://'));
            assert.ok(href.includes(`package=${service==='youtube'?'com.google.android.youtube':'com.instagram.android'}`));
            assert.equal(decodeURIComponent(href.split('S.browser_fallback_url=')[1].split(';end')[0]),SOCIAL_URLS[service]);
          }else assert.equal(href,SOCIAL_URLS[service]);
        }
      }
      assert.equal(await page.locator(`a[href="${SOCIAL_URLS.discord}"]`).count(),2);
      // Install guidance closes, resets when reopened, and never invents a prompt.
      await page.getByRole('button',{name:'SIGUIENTE →',exact:true}).click();
      await page.getByRole('button',{name:'SIGUIENTE →',exact:true}).click();
      await page.getByRole('button',{name:'LISTO →',exact:true}).click();
      await page.locator('#reopen').click();
      await page.getByRole('heading',{name:device.guide,exact:true}).waitFor();
      if(device.intent){
        await page.evaluate(()=>{
          window.installCalls=0;
          const event=new Event('beforeinstallprompt',{cancelable:true});
          event.prompt=async()=>{window.installCalls++};
          event.userChoice=Promise.resolve({outcome:'accepted',platform:'web'});
          window.dispatchEvent(event);
        });
        await page.getByRole('button',{name:'SIGUIENTE →',exact:true}).click();
        await page.getByRole('button',{name:'SIGUIENTE →',exact:true}).click();
        await page.getByRole('button',{name:'INSTALAR AHORA →',exact:true}).click();
        assert.equal(await page.evaluate(()=>window.installCalls),1);
        await page.locator('#reopen').click();
      }
      await page.getByTitle('Cerrar',{exact:true}).click();
      const youtube=page.locator('footer').getByRole('link',{name:'YouTube',exact:true});
      await youtube.click();
      assert.equal(await page.evaluate(()=>window.linkClicks.at(-1).href),await youtube.getAttribute('href'));
      assert.deepEqual(await page.evaluate(()=>window.hydrationErrors),[]);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${name}: ${device.label}, SSR hydration, social routing/fallback, correct install guide`);
      await context.close();
    }
  } finally {await browser.close();}
} finally {await new Promise(resolve=>server.close(resolve));}
