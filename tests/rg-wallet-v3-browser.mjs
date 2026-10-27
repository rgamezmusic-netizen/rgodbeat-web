// Real components/CSS and local API fixtures. No real accounts, payments or RG.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { compile } from '@tailwindcss/node';
const { chromium } = await import(pathToFileURL(process.env.RG_TEST_PLAYWRIGHT_MODULE).href);
const mocks = {
 'next/navigation': 'const router={refresh(){}};export const useRouter=()=>router;',
 'next/link': 'import React from "react";export default function Link({prefetch,...props}){return <a {...props}/>}',
 '@/lib/stripe/client': 'export const getStripeClient=()=>null;',
 '@stripe/react-stripe-js': 'export const EmbeddedCheckoutProvider=()=>null,EmbeddedCheckout=()=>null;',
 '@/contexts/CartContext': `import {useState} from 'react';export function useCart(){const [items,setItems]=useState([{id:'fixture',beat:{id:'b0000000-0000-4000-8000-000000000001',title:'Beat fixture'},licenseTier:'mp3',price:29}]);return {items,isCartOpen:true,closeCart(){},removeFromCart(){},clearCart(){setItems([])},totalAmount:29,itemCount:items.length};}`,
 './CartItemRow': 'export const CartItemRow=()=> <p>Beat fixture · MP3</p>;',
};
const sources = await Promise.all(['components/rg/RgWalletDashboard.tsx','components/cart/CartDrawer.tsx','components/ui/Button.tsx'].map(p=>readFile(p,'utf8')));
const compiler=await compile(await readFile('app/globals.css','utf8'),{base:`${process.cwd()}/app`,onDependency(){}});
const css=compiler.build(sources.join('\n').match(/[^\s"'`<>]+/g));
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {RgWalletDashboard} from './components/rg/RgWalletDashboard';import {CartDrawer} from './components/cart/CartDrawer';
 const root=createRoot(document.getElementById('root'));window.showWallet=wallet=>root.render(<main className="mx-auto max-w-6xl p-4 sm:p-8"><RgWalletDashboard initialWallet={wallet}/></main>);
 window.showCart=()=>root.render(<CartDrawer/>);
 `},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},alias:{'@':process.cwd()},plugins:[{
 name:'isolated-wallet',setup(b){b.onResolve({filter:/^(next\/(navigation|link)|@\/lib\/stripe\/client|@stripe\/react-stripe-js|@\/contexts\/CartContext|\.\/CartItemRow)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}));}
 }]});
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':req.url==='/app.css'?'text/css':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].text:req.url==='/app.css'?css:'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body style="background:#08080b;color:white"><div id="root"></div><script src="/app.js"></script></body></html>')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const report='../RGODBEAT-Contenido/RG-Wallet-Implementacion-2026-10-26';await mkdir(report,{recursive:true});
const wallet=()=>({walletV3:true,balanceRg:5000,debtRg:0,purchasesEnabled:true,redemptionEnabled:true,transfersEnabled:true,
 products:[],passes:[],beatPassEnabled:false,beatPassCostRg:10000,beatPassEligibleTiers:['mp3'],availableBeatPasses:0,reservedBeatPasses:0,consumedBeatPasses:0,cashWithdrawalEnabled:false,tradingEnabled:false,
 rewardStatus:{serverTime:new Date().toISOString(),rewarded:0,remaining:3,nextReward:23,resetsAt:new Date(Date.now()+3600000).toISOString(),seasonPoints:0,seasonNumber:2},movements:[],pendingRedemptions:[]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of (process.env.RG_BROWSER_SURFACE === 'cart' ? [] : [1366,390,320])) {
  const page=await browser.newPage({viewport:{width,height:900},isMobile:width<600,hasTouch:width<600});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let current=wallet(),transferAttempts=0,walletReads=0;const sends=[],buys=[];
  await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;const body=req.method()==='POST'?req.postDataJSON():null;
   let status=200,data;
   if(path==='/api/rg/wallet'){walletReads++;data=current;}
   else if(path==='/api/gift/artists')data={artists:[{stage_name:'LARY',slug:'lary'}]};
   else if(path==='/api/rg/wallet/transfer'){sends.push(body);transferAttempts++;if(transferAttempts===1){status=503;data={error:'Conexión interrumpida. Reintenta el envío.'}}else {current={...current,balanceRg:4000,movements:[{id:'transfer',amount:-1000,reason:'Envío a @lary',created_at:new Date().toISOString()}]};data={transferId:'transfer',amountRg:1000}}}
   else if(path==='/api/rg/wallet/topup'){buys.push(body);status=503;data={error:'Pago de prueba aislado; no se abre Stripe.'}}
   else assert.fail(`Unexpected API ${path}`);
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  if(width===1366) await page.clock.install({time:new Date('2099-01-01T00:00:00Z')});
  await page.goto(base);await page.evaluate(w=>window.showWallet(w),current);
  await page.getByRole('heading',{name:'5,000 RG'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${report}/wallet-${width}.png`,fullPage:true});
  if(width===1366){assert.equal(walletReads,0,'wrong device clock cannot renew the reward block early');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/rg/wallet')),page.clock.fastForward(3601000)]);assert.equal(walletReads,1);await page.clock.fastForward(60000);assert.equal(walletReads,1,'an unchanged backend response cannot cause a refresh loop');}
  if(width===390) {
   await page.getByLabel('Buscar artista').fill('LA');await page.getByRole('button',{name:/LARY.*@lary/}).click();await page.getByLabel('RG que quieres enviar').fill('1000');
   await page.getByRole('button',{name:'REVISAR ENVÍO'}).click();await page.getByRole('button',{name:'CONFIRMAR ENVÍO'}).click();await page.getByRole('alert').filter({hasText:'Conexión interrumpida'}).waitFor();
   await page.getByRole('button',{name:'CONFIRMAR ENVÍO'}).click();await page.getByRole('heading',{name:'4,000 RG'}).waitFor();
   assert.equal(sends.length,2);assert.equal(sends[0].idempotencyKey,sends[1].idempotencyKey);assert.equal(sends[0].artistSlug,'lary');
   await page.getByLabel('Cantidad de RG').fill('2900');await page.getByText('Total: US$29.00',{exact:true}).waitFor();
   await page.getByRole('button',{name:'CONTINUAR AL PAGO SEGURO'}).click();await page.getByRole('alert').filter({hasText:'Pago de prueba'}).waitFor();
   await page.getByRole('button',{name:'CONTINUAR AL PAGO SEGURO'}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('CONTINUAR AL PAGO SEGURO')&&!b.disabled));
   assert.equal(buys.length,2);assert.equal(buys[0].amountRg,2900);assert.equal(buys[0].idempotencyKey,buys[1].idempotencyKey);
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS wallet: ${width}px, no overflow/runtime errors.`);
 }
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));const checkouts=[];let balance=5000;
 await page.route('**/api/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;const body=request.method()==='POST'?request.postDataJSON():null;let data;
  if(path==='/api/rg/wallet')data={...wallet(),balanceRg:balance};
  else if(path==='/api/checkout/rg-wallet'&&body.quoteOnly)data={amountRg:2900,totalUsd:29};
  else if(path==='/api/checkout/rg-wallet'){checkouts.push(body);balance=2100;data={amountRg:2900,totalAmount:0,purchases:[{id:'local-purchase',licenseTier:'mp3',beatTitle:'Beat fixture'}]};}
  else assert.fail(`Unexpected checkout API ${path}`);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base);await page.evaluate(()=>window.showCart());await page.getByRole('button',{name:'USAR RG',exact:true}).click({timeout:5000}).catch(async error=>{console.error('CART DEBUG',JSON.stringify({errors,text:await page.locator('body').innerText()}));await page.screenshot({path:`${report}/carrito-debug.png`,fullPage:true});throw error});
 await page.getByRole('button',{name:'CONFIRMAR COMPRA · 2,900 RG'}).click();await page.getByText('TOTAL: 2,900 RG',{exact:true}).waitFor();
 assert.equal(checkouts.length,1);assert.equal(checkouts[0].expectedAmountRg,2900);assert.equal(checkouts[0].paymentMethod,'rg_wallet');assert.equal(checkouts[0].items[0].licenseTier,'mp3');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 await page.screenshot({path:`${report}/compra-rg-390.png`,fullPage:true});await page.close();
 console.log('PASS cart: authoritative 2900 RG quote, one redemption, confirmed RG receipt, no Stripe payment.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
