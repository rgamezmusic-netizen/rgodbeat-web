// Local browser smoke. No production mutations or test records. Install Playwright
// outside this repo and set RG_TEST_PLAYWRIGHT_MODULE to its module path.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSource } from './helpers/rg-fixtures.mjs';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.RG_TEST_PLAYWRIGHT_MODULE;
if(!modulePath)throw Error('Set RG_TEST_PLAYWRIGHT_MODULE to an external Playwright installation.');
const {chromium}=await import(pathToFileURL(modulePath).href);
const base=process.env.RG_TEST_BASE_URL??'http://localhost:3103';
const output=process.env.RG_TEST_SCREENSHOTS??'/private/tmp/rg-phase3-screenshots';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.RG_TEST_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  for(const width of [360,390,1280]){
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});const errors=[];let rankingRequests=0;
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes('/api/rg/rankings'))rankingRequests++;});
    const response=await page.goto(`${base}/ranking/season`,{waitUntil:'networkidle'});assert.equal(response.status(),200);
    await page.getByRole('heading',{name:'RG TOP 23.',exact:true}).waitFor();
    assert.ok(await page.getByText('En construcción',{exact:true}).isVisible());
    assert.ok(await page.getByText('30 DÍAS PREMIUM',{exact:true}).isVisible());
    for(const kind of ['ARTISTS','BEATS','TRACKS']){
      await page.getByRole('tab',{name:kind,exact:true}).click();
      assert.equal(await page.getByRole('tab',{name:kind,exact:true}).getAttribute('aria-selected'),'true');
      assert.ok(await page.getByRole('tabpanel').isVisible());
    }
    await page.getByRole('tab',{name:'TRACKS',exact:true}).focus();
    await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'ARTISTS',exact:true}).getAttribute('aria-selected'),'true');
    await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'TRACKS',exact:true}).getAttribute('aria-selected'),'true');
    assert.equal(rankingRequests,0,'tabs must not fetch or poll ranking API');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'page must not overflow horizontally');
    assert.equal(await page.getByText('PRESENTADO POR',{exact:true}).count(),0);
    await page.screenshot({path:`${output}/chart-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[],'no hydration or runtime errors');
    console.log(`PASS chart ${width}px: three immediate tabs, no polling, no overflow/runtime errors`);
    if(width===390){
      const wallet=await page.request.get(`${base}/api/rg/wallet`);assert.equal(wallet.status(),401);
      await page.goto(`${base}/rg/wallet`,{waitUntil:'networkidle'});assert.ok(page.url().includes('/login?redirect='));
      const invalid=await page.goto(`${base}/rg/tracks/not-a-uuid`);assert.equal(invalid.status(),404);
      const absent=await page.goto(`${base}/rg/artists/phase3-absent-profile`);assert.equal(absent.status(),404);
      console.log('PASS anonymous wallet protection and invalid/missing profile 404');
      if(process.env.RG_TEST_ARTIST_SLUG){
        const artist=await page.goto(`${base}/rg/artists/${process.env.RG_TEST_ARTIST_SLUG}`,{waitUntil:'networkidle'});assert.equal(artist.status(),200);
        assert.equal(await page.getByText('RG BALANCE',{exact:true}).count(),0,'visitor must not see balance');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await page.screenshot({path:`${output}/artist-390.png`,fullPage:true});
        console.log('PASS real public artist profile; no visitor balance and no horizontal overflow');
      }
      if(process.env.RG_TEST_BEAT_SLUG){
        const beat=await page.goto(`${base}/rg/beats/${process.env.RG_TEST_BEAT_SLUG}`,{waitUntil:'networkidle'});assert.equal(beat.status(),200);
        assert.ok(await page.getByRole('link',{name:'ESCUCHAR / USAR ESTE BEAT'}).isVisible());
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
        await page.screenshot({path:`${output}/beat-390.png`,fullPage:true});console.log('PASS real catalog beat profile and discovery link');
      }
      if(process.env.RG_TEST_DRAFT_TRACK_ID){const draft=await page.goto(`${base}/rg/tracks/${process.env.RG_TEST_DRAFT_TRACK_ID}`);assert.equal(draft.status(),404);console.log('PASS real draft remains private (404)');}
    }
    await page.close();
  }
  // Isolated populated-card fixture: render the actual component/CSS, never seed a DB.
  const {ChartRow}=loadSource('components/ranking/RgProductParts.tsx',{
    './RgProduct.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
    'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
    '@/components/layout':{Navbar:()=>null,Footer:()=>null},
  });
  const page=await browser.newPage({viewport:{width:360,height:800}});
  const fixture={entityId:'local-fixture',rank:1,score:2480,previousRank:4,movement:3,isNew:false,track:{title:'Una canción con un título muy largo para comprobar la tarjeta en móvil'},artist:{stage_name:'Artista de fixture local'},onFire:false};
  const markup=renderToStaticMarkup(React.createElement(ChartRow,{entry:fixture,kind:'tracks'}));
  const css=await readFile('components/ranking/RgProduct.module.css','utf8');
  await page.setContent(`<style>body{margin:0;font-family:Arial}*{box-sizing:border-box}${css}</style><div class="page"><main class="main">${markup}</main></div>`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.ok(await page.getByText('↑ 3',{exact:true}).isVisible());
  await page.screenshot({path:`${output}/local-fixture-row-360.png`,fullPage:true});
  console.log('PASS isolated populated ranking card: long title, movement and no 360px overflow');
  await page.close();
} finally {await browser.close();}
