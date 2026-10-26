// Actual header/hero/CSS and CartProvider, with isolated auth/router adapters.
// No real accounts, payments, publications, or external requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const {chromium}=await import(pathToFileURL(process.env.STUDIO_PLAYWRIGHT_PATH).href);
const mocks={
  'next/navigation': `import {useSyncExternalStore} from 'react';let path='/';const listeners=new Set();window.navigateHeader=p=>{path=p;listeners.forEach(f=>f())};export const usePathname=()=>useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>path);export const useRouter=()=>({push:window.navigateHeader});`,
  'next/link': `import React from 'react';export default function Link({href,prefetch,onClick,children,...props}){return <a {...props} href={href} onClick={e=>{onClick?.(e);e.preventDefault();window.navigateHeader(href)}}>{children}</a>}`,
  'next/image': `import React from 'react';export default function Image({children,...props}){return <img {...props}/>}`,
  '@/lib/auth/client': `export const getBrowserUser=()=>new Promise(resolve=>{window.resolveBrowserUser=resolve});`,
  '@/lib/supabase/client': `export const createClient=()=>({auth:{onAuthStateChange(callback){window.headerAuthEvent=callback;return{data:{subscription:{unsubscribe(){window.headerUnsubscribed=(window.headerUnsubscribed||0)+1}}}}}}});`,
};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {Navbar} from './components/layout/Navbar';import {Hero} from './components/home/Hero';
import {CartProvider,useCart} from './contexts/CartContext';
const root=createRoot(document.getElementById('root'));window.unmountHeader=()=>root.unmount();
function Harness(){const cart=useCart();return <><Navbar/><Hero/><p id="font-size-regression" className="text-base text-zinc-100">Tamaño normal legible</p><button id="add-fixture" onClick={()=>cart.addToCart({id:'local-beat',title:'Fixture aislado',pricing:{mp3:25}},'mp3')}>Añadir fixture</button>{cart.isCartOpen&&<div role="dialog" aria-label="Carrito aislado"><button onClick={cart.closeCart}>Cerrar carrito</button></div>}</>}
root.render(<CartProvider><Harness/></CartProvider>);
`},bundle:true,write:false,outfile:'header.js',platform:'browser',format:'iife',jsx:'automatic',alias:{'@':process.cwd()},plugins:[{
  name:'isolated-header-adapters',setup(b){
    b.onResolve({filter:/^(next\/navigation|next\/link|next\/image|@\/lib\/auth\/client|@\/lib\/supabase\/client)$/},a=>({path:a.path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));
  },
}]});
const global=await postcss([tailwind()]).process(await readFile('app/globals.css','utf8'),{from:process.cwd()+'/app/globals.css'});
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=global.css+'\n'+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
const server=createServer(async(req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}
  else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else if(req.url==='/images/rgodbeat-logo.png'){res.setHeader('Content-Type','image/png');res.end(await readFile('public/images/rgodbeat-logo.png'));}
  else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base);await page.waitForFunction(()=>typeof window.resolveBrowserUser==='function');
  const nav=page.getByRole('navigation',{name:'Navegación principal'});
  // Font size must never set the dark background color on text again.
  const font=await page.locator('#font-size-regression').evaluate(el=>({color:getComputedStyle(el).color,size:getComputedStyle(el).fontSize}));
  assert.equal(font.size,'16px');assert.notEqual(font.color,'rgb(8, 8, 10)');
  const user={id:'local-user',email:'header@example.invalid'};
  await page.evaluate(user=>window.headerAuthEvent('SIGNED_IN',{user}),user);
  await page.waitForFunction(()=>document.querySelector('nav a[aria-label="Mi Cuenta"]')?.getAttribute('href')==='/account');
  await page.evaluate(user=>{window.headerAuthEvent('SIGNED_OUT',null);window.resolveBrowserUser(user)},user);
  await page.waitForFunction(()=>document.querySelector('nav a[aria-label="Acceso Artistas"]')?.getAttribute('href')==='/login');
  await page.evaluate(user=>window.headerAuthEvent('SIGNED_IN',{user}),user);
  await nav.getByRole('link',{name:'Mi Cuenta',exact:true}).waitFor();
  // Cart context and header count survive client section changes.
  await page.locator('#add-fixture').click();await page.getByRole('button',{name:'Cerrar carrito',exact:true}).click();
  await nav.getByRole('button',{name:'Abrir carrito, 1 producto',exact:true}).waitFor();
  for(const width of [320,390,768,1280,1440]){
    await page.setViewportSize({width,height:900});await page.evaluate(()=>scrollTo(0,0));
    const actions=page.getByRole('navigation',{name:'Explorar RGODBEAT'});
    const info=await actions.locator('a,button').evaluateAll(es=>es.map(el=>{
      const s=getComputedStyle(el),r=el.getBoundingClientRect();
      const ctx=document.createElement('canvas').getContext('2d');
      const lum=color=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const c=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
      const a=lum(s.color),b=lum(s.backgroundColor);
      return{text:el.textContent,height:r.height,width:r.width,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),animation:s.animationName,opacity:s.opacity};
    }));
    assert.equal(info.length,3);for(const action of info){assert.ok(action.contrast>=4.5,JSON.stringify(action));assert.equal(action.animation,'none');assert.equal(action.opacity,'1');assert.ok(action.height>=64);}
    assert.ok(Math.max(...info.map(x=>x.height))-Math.min(...info.map(x=>x.height))<1);
    if(width<1280){
      const menu=nav.getByRole('button',{name:'Menú principal',exact:true});await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');assert.equal(await menu.evaluate(el=>el===document.activeElement),true);
      await menu.click();await nav.getByRole('link',{name:'SERVICIOS',exact:true}).click();assert.equal(await menu.getAttribute('aria-expanded'),'false');
      await menu.click();assert.equal(await nav.getByRole('link',{name:'SERVICIOS',exact:true}).getAttribute('aria-current'),'page');await page.keyboard.press('Escape');
    }else{
      await nav.getByRole('link',{name:'BIOGRAFÍA',exact:true}).click();assert.equal(await nav.getByRole('link',{name:'BIOGRAFÍA',exact:true}).getAttribute('aria-current'),'page');
      const last=await nav.getByRole('link',{name:'BIOGRAFÍA',exact:true}).boundingBox(),account=await nav.getByRole('link',{name:'Mi Cuenta',exact:true}).boundingBox();assert.ok(last.x+last.width<=account.x);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await nav.getByRole('button',{name:'Abrir carrito, 1 producto',exact:true}).click();await page.getByRole('button',{name:'Cerrar carrito',exact:true}).click();
    console.log(`PASS ${width}px: ${JSON.stringify(info)}`);
  }
  await page.evaluate(()=>window.unmountHeader());assert.equal(await page.evaluate(()=>window.headerUnsubscribed),1);
  assert.deepEqual(errors,[]);console.log('PASS header session synchronization, stale-read protection, active routes, mobile keyboard, cart continuity, contrast and text-base regression');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
