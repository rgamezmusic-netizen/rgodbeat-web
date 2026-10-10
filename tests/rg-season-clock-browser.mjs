// Isolated clock regression: actual chart component, mocked navigation only.
// No production requests, publications, season mutations or payments.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.RG_TEST_PLAYWRIGHT_MODULE).href);
const mocks = {
  'next/navigation': 'const router={refresh(){window.seasonRefreshes++}};export const useRouter=()=>router;',
  'next/link': `import React from 'react';export default function Link({children,prefetch,...props}){return React.createElement('a',props,children)}`,
  'next/image': `import React from 'react';export default function Image(props){return React.createElement('img',props)}`,
  '@/components/layout': 'export const Navbar=()=>null,Footer=()=>null;',
};
const bundle = await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {RgSeasonRankingClient} from './components/ranking/RgSeasonRankingClient';
import {syncNavigationClock} from './lib/browser/navigation-clock';
const root=createRoot(document.getElementById('root'));
window.seasonRefreshes=0;window.showSeason=data=>root.render(<RgSeasonRankingClient data={data}/>);
window.syncNavigationClock=syncNavigationClock;
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':process.cwd()},plugins:[{
  name:'isolated-navigation',setup(b){
    b.onResolve({filter:/^(next\/navigation|next\/link|next\/image|@\/components\/layout)$/},a=>({path:a.path,namespace:'mock'}));
    b.onResolve({filter:/\.module\.css$/},a=>({path:a.path,namespace:'style'}));
    b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));
    b.onLoad({filter:/.*/,namespace:'style'},()=>({contents:'export default new Proxy({}, {get:(_,key)=>String(key)});',loader:'js'}));
  },
}]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>assert.fail(`Isolated clock cannot request ${request.url()}`));
  await page.clock.install({time:new Date('2099-01-01T00:00:00Z')});
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const chart={season:{id:'first',season_number:1,name:'Season 01',starts_at:'2026-10-06T00:00:00Z',ends_at:'2026-10-06T00:01:00Z',status:'active'},serverTime:'2026-10-06T00:00:00Z',rewardPoolRg:0,rewards:[],sponsors:[],rankings:{tracks:[],artists:[],beats:[]}};
  await page.evaluate(data=>window.showSeason(data),chart);
  await page.getByText('EN CURSO',{exact:true}).waitFor();
  await page.clock.fastForward(30_000);
  assert.equal(await page.evaluate(()=>window.seasonRefreshes),0,'wrong phone clock cannot advance a season');
  await page.clock.fastForward(30_000);
  assert.equal(await page.evaluate(()=>window.seasonRefreshes),1,'boundary requests the next season');
  assert.equal(await page.getByText('EN CURSO',{exact:true}).count(),0,'an expired season cannot keep its active badge');
  await page.clock.fastForward(120_000);
  assert.equal(await page.evaluate(()=>window.seasonRefreshes),1,'an unchanged server response cannot create a refresh loop');
  await page.evaluate(data=>window.showSeason(data),{...chart,season:{...chart.season,id:'second',season_number:2,starts_at:'2026-10-06T00:01:00Z',ends_at:'2026-10-20T00:01:00Z'},serverTime:'2026-10-06T00:01:00Z'});
  await page.getByText('14 DÍAS RESTANTES',{exact:true}).waitFor();
  await page.evaluate(()=>{window.testHidden=true;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden})});
  await page.clock.fastForward(14*86_400_000);
  assert.equal(await page.evaluate(()=>window.seasonRefreshes),1,'a background tab defers navigation');
  await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'))});
  assert.equal(await page.evaluate(()=>window.seasonRefreshes),2,'returning to the chart advances the new boundary once');
  await page.clock.fastForward(120_000);
  assert.equal(await page.evaluate(()=>window.seasonRefreshes),2);
  // Open an old prefetched payload with a newer server clock and a wrong device clock.
  await page.evaluate(async()=>{
    window.fetch=async()=>new Response(JSON.stringify({serverTime:'2026-10-22T00:00:00Z'}),{headers:{'Content-Type':'application/json'}});
    await window.syncNavigationClock();
  });
  await page.evaluate(data=>window.showSeason(data),{...chart,season:{...chart.season,id:'warm-old',ends_at:'2026-10-21T00:00:00Z'},serverTime:'2026-10-20T00:00:00Z'});
  await page.waitForFunction(()=>window.seasonRefreshes===3);
  assert.equal(await page.getByText('EN CURSO',{exact:true}).count(),0,'a stale prefetched season cannot become active again');
  assert.deepEqual(errors,[]);
  console.log('PASS season clock: server time, automatic boundary, no retry loop, next season, tab return and expired prefetched payload');
}finally{await browser.close()}
