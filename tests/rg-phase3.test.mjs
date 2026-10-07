import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadSource } from './helpers/rg-fixtures.mjs';
import { marketRows } from './helpers/rg-market-fixtures.mjs';

const presentation = loadSource('lib/rg/product/presentation.ts');
const ids={track:'11111111-1111-4111-8111-111111111111',artist:'22222222-2222-4222-8222-222222222222',beat:'33333333-3333-4333-8333-333333333333'};
const artist={id:ids.artist,stage_name:'Fixture Artist',slug:'fixture-artist',bio:'A local fixture.',status:'active',user_id:'NEVER-PUBLIC',email:'NEVER-PUBLIC'};
const track={id:ids.track,title:'Fixture Track',beat_id:ids.beat,status:'published'};
const beat={id:ids.beat,title:'Fixture Beat',slug:'fixture-beat',cover_path:'covers/fixture/cover.jpg',published:true};
const season={id:'season',season_number:1,name:'Season 01',starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-10-15T00:00:00Z',status:'active',rules_version:1};
const entry={entityId:ids.track,rank:1,score:10,previousRank:4,movement:3,isNew:false,onFire:false,track,artist};
const chart={season,serverTime:'2026-10-01T00:00:00Z',rewardPoolRg:0,sponsors:[],rewards:[{place:1,premiumDays:30,poolSharePercent:40},{place:2,premiumDays:15,poolSharePercent:25},{place:3,premiumDays:15,poolSharePercent:15}],rankings:{tracks:[],artists:[],beats:[]}};

// Query fixture applies the actual equality/visibility filters; all data stays local.
function database(tables, errors={}) {
  const queries=[];
  return {queries,from(table){const filters=[];let columns,one=false,max=Infinity,start=0,end=Infinity;const orders=[];
    const q={select(v){columns=v;return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v,true]);return q;},lte(k,v){filters.push([k,v,'lte']);return q;},order(k,o){orders.push([k,o]);return q;},limit(v){max=v;return q;},range(a,b){start=a;end=b;return q;},maybeSingle(){one=true;return q;},single(){one=true;return q;},then(fn){
      queries.push({table,columns,filters});let rows=(tables[table]??[]).filter(row=>filters.every(([key,val,multiple])=>{const actual=key.split('.').reduce((v,k)=>v?.[k],row);return multiple==='lte'?actual<=val:multiple===true?val.includes(actual):actual===val;}));
      for(const [key,options] of orders)rows=rows.toSorted((a,b)=>String(a[key]).localeCompare(String(b[key]))*(options?.ascending===false?-1:1));
      rows=rows.slice(start,Math.min(end+1,start+max));return Promise.resolve({data:one?rows[0]??null:rows,error:errors[table]??null,count:rows.length}).then(fn);
    }};return q;
  }};
}
const replacements={
  './RgProduct.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
  '@/components/ranking/RgProduct.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})},
  'next/link':{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)},
  'next/image':{__esModule:true,default:(props)=>{const imageProps={...props};delete imageProps.unoptimized;return React.createElement('img',imageProps);}},
  'next/navigation':{useRouter:()=>({refresh(){}}),notFound:()=>{throw Error('NOT_FOUND');},redirect:()=>{throw Error('REDIRECT');}},
  '@/components/layout':{Navbar:()=>null,Footer:()=>null},
};
const html=(component,props)=>renderToStaticMarkup(React.createElement(component,props));

function profiles(tables,customChart=chart,errors={}) {
  const db=database(tables,errors);
  return {...loadSource('lib/rg/product/profiles.ts',{'@/lib/rg/phase2/database':{createPhase2AdminClient:()=>db},'./chart':{getRgChart:async()=>customChart}}),db};
}
function baseTables(){return {rg_artists:[artist],rg_tracks:[track],beats:[beat],rg_track_artists:[{track_id:ids.track,artist_id:ids.artist,role:'primary',rg_tracks:track}]};}

test('countdown follows server UTC boundaries, elapsed time and expired/invalid seasons',()=>{
  for(const [end,expected] of [['2026-10-15T00:00:00Z','14 DÍAS RESTANTES'],['2026-10-01T18:00:00Z','18 HORAS RESTANTES'],['2026-10-01T00:10:00Z','10 MINUTOS RESTANTES'],['2026-10-01T00:00:00Z','TEMPORADA CERRADA']])assert.equal(presentation.seasonCountdown(end,chart.serverTime),expected);
  assert.equal(presentation.seasonCountdown('2026-10-01T00:10:00Z',chart.serverTime,60_000),'9 MINUTOS RESTANTES');
  assert.equal(presentation.seasonCountdown('bad',chart.serverTime),'TEMPORADA EN PREPARACIÓN');
});
test('movement uses snapshot values, not invented movement',()=>{
  assert.equal(presentation.movementLabel(4,false),'↑ 4');assert.equal(presentation.movementLabel(-2,false),'↓ 2');
  assert.equal(presentation.movementLabel(null,true),'NEW');assert.equal(presentation.movementLabel(0,false),'—');assert.equal(presentation.movementLabel(null,false),'—');
});
test('public chart DTO allowlists identity and takes prizes from actual rules',async()=>{
  const source={...chart,rankings:{tracks:[entry],artists:[{...entry,entityId:ids.artist,artist}],beats:[{...entry,entityId:ids.beat,beat}]},sponsors:[{visibility_tier:'OFFICIAL_SPONSOR',sponsor:{name:'Approved fixture',website_url:'javascript:alert(1)',logo_path:'private/secret',owner_user_id:'NEVER-PUBLIC',payment_reference:'NEVER-PUBLIC'}}]};
  const db=database({rg_rule_versions:[{version:1,reward_distribution:{1:40,2:25,3:15,premium_days:{1:30,2:15,3:15}}}]});
  const {getRgChart}=loadSource('lib/rg/product/chart.ts',{'@/lib/rg/phase2/rankings':{getRgSeasonRankings:async()=>source},'@/lib/rg/phase2/database':{createPhase2AdminClient:()=>db}});
  const data=await getRgChart();assert.deepEqual(data.rewards,chart.rewards);assert.equal(data.rankings.beats[0].rankedTrackCount,1);
  assert.equal(data.sponsors[0].websiteUrl,null);assert.equal(data.sponsors[0].logoUrl,null);assert.equal(data.rankings.tracks[0].onFire,false);
  assert.ok(!JSON.stringify(data).includes('NEVER-PUBLIC'));assert.ok(!Object.hasOwn(data.season,'rules_version'));
});
test('invalid reward rules cause an unavailable response rather than fabricated prizes',async()=>{
  const db=database({rg_rule_versions:[{version:1,reward_distribution:{1:100,premium_days:{1:30}}}]});
  const {getRgChart}=loadSource('lib/rg/product/chart.ts',{'@/lib/rg/phase2/rankings':{getRgSeasonRankings:async()=>chart},'@/lib/rg/phase2/database':{createPhase2AdminClient:()=>db}});
  await assert.rejects(getRgChart,/invalid/);
});
test('artist public profile hides draft/archived tracks and private identity',async()=>{
  const tables=baseTables();tables.rg_track_artists.push({track_id:'draft',artist_id:ids.artist,role:'primary',rg_tracks:{id:'draft',title:'SECRET DRAFT',status:'draft'}});
  tables.rg_score_events=[{id:'score',season_id:'season',artist_id:ids.artist,score_points:13}];
  const data=await profiles(tables).getArtistProfile('fixture-artist');assert.equal(data.performance.score,13);assert.equal(data.performance.rank,null);
  assert.deepEqual(data.tracks,[{id:ids.track,title:track.title}]);assert.ok(!JSON.stringify(data).includes('SECRET'));assert.ok(!JSON.stringify(data).includes('NEVER-PUBLIC'));
  assert.equal(await profiles(tables).getArtistProfile('../unsafe'),null);
  tables.rg_artists=[{...artist,status:'suspended'}];assert.equal(await profiles(tables).getArtistProfile('fixture-artist'),null);
});
test('history includes only finalized snapshot results, never live placements',async()=>{
  const tables=baseTables();tables.rg_season_finalizations=[{season_id:'old',rank_run_id:'final',finalized_at:'2026-09-30'}];tables.rg_seasons=[{id:'old',status:'finalized',season_number:1}];
  tables.rg_rank_snapshots=[{season_id:'old',run_id:'final',ranking_type:'artists',entity_id:ids.artist,rank:2,score:'25'},{season_id:'season',run_id:'daily',ranking_type:'artists',entity_id:ids.artist,rank:1,score:100}];
  assert.deepEqual((await profiles(tables).getArtistProfile('fixture-artist')).history,[{seasonNumber:1,rank:2,score:25}]);
});
test('track profile enforces public track/active artist, canonical beat and projection movement',async()=>{
  const data=await profiles(baseTables(),{...chart,rankings:{...chart.rankings,tracks:[entry]}}).getTrackProfile(ids.track);
  assert.equal(data.beat.id,ids.beat);assert.equal(data.performance.rank,1);assert.equal(data.performance.movement,3);assert.equal(data.publication,null);
  const tables=baseTables();tables.rg_tracks=[{...track,status:'draft'}];assert.equal(await profiles(tables).getTrackProfile(ids.track),null);
  assert.equal(await profiles(baseTables()).getTrackProfile('not-a-uuid'),null);
});
test('YouTube links require a confirmed matching PUBLIC job; private/unlisted/orphaned links stay hidden',async()=>{
  for(const privacy of ['private','unlisted','public']){
    const tables=baseTables();tables.rg_publication_links=[{id:'pub',track_id:ids.track,artist_id:ids.artist,youtube_export_job_ref:'job',youtube_video_id:'verified-video',published_at:'2026-10-02'}];
    tables.youtube_export_jobs=[{id:'job',status:'uploaded',privacy,youtube_video_id:'verified-video'}];
    const data=await profiles(tables).getTrackProfile(ids.track);assert.equal(Boolean(data.publication),privacy==='public');
    if(privacy!=='public')assert.ok(!JSON.stringify(data).includes('verified-video'));
    tables.youtube_export_jobs[0].youtube_video_id='mismatch';assert.equal((await profiles(tables).getTrackProfile(ids.track)).publication,null);
    tables.rg_publication_links[0].youtube_export_job_ref=null;assert.equal((await profiles(tables).getTrackProfile(ids.track)).publication,null);
  }
});
test('beat detail shows reliably derived ranked tracks and catalog discovery, external tracks excluded',async()=>{
  const ranked={...chart,rankings:{...chart.rankings,tracks:[entry,{...entry,entityId:'external',track:{...track,beat_id:null}}]}};
  const data=await profiles(baseTables(),ranked).getBeatProfile('fixture-beat');assert.equal(data.tracks.length,1);assert.equal(data.beat.slug,'fixture-beat');
});
test('empty chart intentional: no invented entries, sponsors, ON FIRE or payment buttons',()=>{
  const {RgSeasonRankingClient}=loadSource('components/ranking/RgSeasonRankingClient.tsx',replacements);
  const markup=html(RgSeasonRankingClient,{data:chart});assert.match(markup,/0 <span[^>]*>RG/);assert.match(markup,/EN CURSO/);assert.match(markup,/MANTANTE EN EL TOP/);assert.match(markup,/La próxima canción/);assert.match(markup,/14 DÍAS RESTANTES/);
  assert.doesNotMatch(markup,/En construcción|Haz que tu música suba|Actividad verificada, posiciones automáticas|todavía no están habilitados/);
  assert.match(markup,/TOP 3 ARTISTS/);assert.match(markup,/30 DÍAS PREMIUM/);assert.match(markup,/40% DEL REWARD POOL/);
  assert.doesNotMatch(markup,/ON FIRE|PRESENTADO POR|BUY RG|BOOST THE POOL|auth_uuid|source_id/);
  assert.equal((markup.match(/role="tab"/g)??[]).length,3);
});
test('ranking row is tappable, retains mobile movement and correctly identifies the leader',()=>{
  const {ChartRow}=loadSource('components/ranking/RgProductParts.tsx',replacements);
  const markup=html(ChartRow,{entry,kind:'tracks'});assert.match(markup,/Fixture Track/);assert.match(markup,/↑ 3/);assert.match(markup,/LIDERA LA TEMPORADA/);assert.match(markup,new RegExp(`/rg/tracks/${ids.track}`));assert.doesNotMatch(markup,/hidden|NEVER-PUBLIC/);
});
test('sponsor UI hides empty area and shows only provided approved names/links',()=>{
  const {Sponsors}=loadSource('components/ranking/RgProductParts.tsx',replacements);
  assert.equal(html(Sponsors,{sponsors:[]}),'');const markup=html(Sponsors,{sponsors:[{name:'Local approved sponsor',websiteUrl:'https://example.invalid/',logoUrl:null,tier:'TITLE_PARTNER'}]});
  assert.match(markup,/PRESENTADO POR/);assert.match(markup,/noopener noreferrer/);assert.doesNotMatch(markup,/<img/);
});
test('private wallet presentation shows real zero and available inventory without inventing discounts',()=>{
  const {RgBalance}=loadSource('components/ranking/RgBalance.tsx',replacements);const markup=html(RgBalance,{wallet:{balanceRg:0,availableBeatPasses:1,reservedBeatPasses:0,consumedBeatPasses:0,beatPassEnabled:true}});
  assert.match(markup,/SOLO VISIBLE PARA TI/);assert.match(markup,/0 RG/);assert.match(markup,/1 AVAILABLE/);assert.doesNotMatch(markup,/50%/);assert.doesNotMatch(markup,/<button|<input|BUY RG|REDEEM/);
});
test('wallet queries validated owner only, prevents bad balances, and authenticated API never caches publicly',async()=>{
  const db=database({rg_spendable_balances:[{user_id:'owner',balance_rg:'1250'},{user_id:'other',balance_rg:9999}],rg_beat_passes:[],rg_market_products:marketRows,rg_economy_config:[{id:true,beat_pass_enabled:true,market_v1_enabled:false}]});
  const mocks={'@/lib/rg/phase2/database':{createPhase2AdminClient:()=>db},'@/lib/auth/server':{getCurrentUser:async()=>({id:'owner',email:'NEVER-PUBLIC'})}};
  const {getRgWalletSummary}=loadSource('lib/rg/product/wallet.ts',mocks);assert.equal((await getRgWalletSummary('owner')).balanceRg,1250);
  const response=await loadSource('app/api/rg/wallet/route.ts',mocks).GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.ok(!JSON.stringify(await response.json()).includes('NEVER-PUBLIC'));
  const bad=database({rg_spendable_balances:[{user_id:'owner',balance_rg:-1}],rg_beat_passes:[],rg_market_products:marketRows,rg_economy_config:[{id:true}]});
  await assert.rejects(loadSource('lib/rg/product/wallet.ts',{'@/lib/rg/phase2/database':{createPhase2AdminClient:()=>bad}}).getRgWalletSummary('owner'),/invalid/);
});
test('public API still uses Phase 2 automatic projection and no repeated client polling is introduced',async()=>{
  const route=loadSource('app/api/rg/rankings/route.ts',{'@/lib/rg/phase2/rankings':{getRgSeasonRankings:async()=>chart}});
  assert.equal((await route.GET()).status,200);assert.doesNotMatch(readFileSync('components/ranking/RgSeasonRankingClient.tsx','utf8'),/fetch\(|60_000/);
});
test('homepage and both TOP 23 menu links use the existing RG chart; legacy ranking stays intact',()=>{
  assert.equal(presentation.RG_CHART_PATH,'/ranking/season');
  const mocks={...replacements,
    './Hero.module.css':{__esModule:true,default:{}},
    '@/components/ui/Button':{Button:({children,href})=>React.createElement('a',{href},children)},
    '@/contexts/CartContext':{useCart:()=>({openCart(){},itemCount:0})},
    '@/lib/auth/client':{getBrowserUser:async()=>null},
  };
  const {Hero}=loadSource('components/home/Hero.tsx',mocks);
  const {Navbar}=loadSource('components/layout/Navbar.tsx',mocks);
  for(const component of [Hero,Navbar])assert.match(html(component),/href="\/ranking\/season"[^>]*>TOP 23/);
  const menu=readFileSync('components/layout/Navbar.tsx','utf8');
  assert.equal((menu.match(/href=\{RG_CHART_PATH\}/g)??[]).length,2);
  assert.match(readFileSync('app/ranking/page.tsx','utf8'),/getPublicChart/);
  assert.doesNotMatch(readFileSync('app/ranking/page.tsx','utf8'),/getRgChart|redirect\(/);
});
test('Studio entry CTA stays visible with empty or low chart activity, without transactional actions',()=>{
  const {RgSeasonRankingClient}=loadSource('components/ranking/RgSeasonRankingClient.tsx',replacements);
  for(const data of [chart,{...chart,rankings:{...chart.rankings,tracks:[entry]}}]){
    const markup=html(RgSeasonRankingClient,{data});
    assert.match(markup,/href="\/studio"[^>]*>PUBLICAR EN RGODBEAT STUDIO/);
    assert.doesNotMatch(markup,/BUY RG|REDEEM RG|BOOST THE POOL/);
  }
});
test('wallet page and member card require server session; public profile modules cannot query balance or auth email',async()=>{
  const page=loadSource('app/rg/wallet/page.tsx',{...replacements,'@/lib/auth/server':{getCurrentUser:async()=>null},'@/lib/rg/product/wallet':{getRgWalletSummary:async()=>{throw Error('Must not query');}}});
  await assert.rejects(page.default(),/REDIRECT/);
  const profileSource=readFileSync('lib/rg/product/profiles.ts','utf8');assert.doesNotMatch(profileSource,/user_id|email|rg_coin_ledger|rg_coin_balances/);
});


test('actual sponsor projection excludes pending sponsors and inactive/future/expired campaigns',async()=>{
  const now=new Date('2026-10-05T00:00:00Z');
  const link=(sponsor_id,starts_at,ends_at,status='active')=>({season_id:'season',sponsor_id,starts_at,ends_at,status,visibility_tier:'OFFICIAL_SPONSOR'});
  const db=database({rg_seasons:[season],rg_season_sponsorships:[
    link('approved','2026-10-01','2026-10-10'),link('pending','2026-10-01','2026-10-10'),
    link('future','2026-10-07','2026-10-10'),link('expired','2026-10-01','2026-10-02'),link('inactive','2026-10-01','2026-10-10','cancelled')],
    rg_sponsors:[{id:'approved',status:'active',name:'Approved',website_url:'https://example.invalid'},{id:'pending',status:'pending',name:'Not approved'}],
  });db.rpc=async name=>({data:name==='rg_ensure_seasons'?'season':[],error:null});
  const {getRgSeasonRankings}=loadSource('lib/rg/phase2/rankings.ts',{'./database':{createPhase2AdminClient:()=>db}});
  const data=await getRgSeasonRankings(now);assert.deepEqual(data.sponsors.map(row=>row.sponsor.name),['Approved']);
});
test('track page renders real profile DTO, canonical discovery and public video performance only',async()=>{
  const profile={track,artist,beat:{...beat,coverUrl:null},performance:{rank:1,score:10,movement:3,isNew:false,onFire:false},seasonNumber:1,
    publication:{url:'https://www.youtube.com/watch?v=fixture-public-video',publishedAt:'2026-10-01',viewCount:1250,observedAt:'2026-10-05T00:00:00Z',milestoneCount:1}};
  const page=loadSource('app/rg/tracks/[id]/page.tsx',{...replacements,'@/lib/rg/product/profiles':{getTrackProfile:async()=>profile}});
  const markup=renderToStaticMarkup(await page.default({params:Promise.resolve({id:ids.track})}));
  assert.match(markup,/Fixture Track/);assert.match(markup,/Fixture Artist/);assert.match(markup,/\/rg\/beats\/fixture-beat/);assert.match(markup,/1,250 vistas verificadas/);assert.match(markup,/↑ 3/);assert.doesNotMatch(markup,/NEVER-PUBLIC/);
  profile.publication=null;const hidden=renderToStaticMarkup(await page.default({params:Promise.resolve({id:ids.track})}));assert.doesNotMatch(hidden,/fixture-public-video|vistas verificadas/);
});
test('chart read failure is visibly unavailable rather than falsely empty',async()=>{
  const page=loadSource('app/ranking/season/page.tsx',{...replacements,
    '@/lib/rg/product/chart':{getRgChart:async()=>{throw Error('Service unavailable');}},
    '@/components/ranking/RgMemberCard':{RgMemberCard:()=>null},
  });
  const markup=renderToStaticMarkup(await page.default());assert.match(markup,/El chart volverá/);assert.match(markup,/role="alert"/);assert.doesNotMatch(markup,/En construcción|30 DÍAS PREMIUM/);
});

test('catalog profile preserves existing non-RG slug formats without inferring beat identity',async()=>{
  const tables=baseTables();tables.beats=[{...beat,slug:'Legacy_Beat'}];
  assert.equal((await profiles(tables).getBeatProfile('Legacy_Beat')).beat.id,ids.beat);
  assert.equal(await profiles(tables).getBeatProfile('../unsafe'),null);
});

test('every public profile handles service outages without fabricating zero data or exposing error details; absent profiles still 404',async()=>{
  for(const [file,method,params] of [
    ['app/rg/artists/[slug]/page.tsx','getArtistProfile',{slug:'fixture-artist'}],
    ['app/rg/tracks/[id]/page.tsx','getTrackProfile',{id:ids.track}],
    ['app/rg/beats/[slug]/page.tsx','getBeatProfile',{slug:'fixture-beat'}],
  ]) {
    let unavailable=true;
    const page=loadSource(file,{...replacements,
      '@/lib/rg/product/profiles':{[method]:async()=>{if(unavailable)throw Error('PRIVATE DATABASE DETAIL');return null;}},
      '@/components/ranking/RgMemberCard':{RgMemberCard:()=>null},
    });
    const markup=renderToStaticMarkup(await page.default({params:Promise.resolve(params)}));
    assert.match(markup,/role="alert"/);assert.match(markup,/El perfil volverá/);assert.match(markup,/VOLVER A INTENTAR/);
    assert.doesNotMatch(markup,/PRIVATE DATABASE DETAIL|SEASON SCORE|vistas verificadas|Sin posición/);
    unavailable=false;await assert.rejects(page.default({params:Promise.resolve(params)}),/NOT_FOUND/);
  }
});
test('authenticated wallet and member sections keep read outages distinct from a zero balance',async()=>{
  const mocks={...replacements,'@/lib/auth/server':{getCurrentUser:async()=>({id:'owner'})},
    '@/lib/rg/product/wallet':{getRgWalletSummary:async()=>{throw Error('PRIVATE LEDGER DETAIL');}},
    '@/lib/rg/identity':{getOwnedArtist:async()=>null},
  };
  const wallet=loadSource('app/rg/wallet/page.tsx',mocks);
  const markup=renderToStaticMarkup(await wallet.default());assert.match(markup,/Tu saldo volverá/);assert.doesNotMatch(markup,/PRIVATE LEDGER DETAIL|0 <span/);
  const {RgMemberCard}=loadSource('components/ranking/RgMemberCard.tsx',mocks);
  assert.match(renderToStaticMarkup(await RgMemberCard()),/Tu saldo no está disponible/);
});
