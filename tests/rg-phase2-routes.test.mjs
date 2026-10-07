import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

function cronFixture({ factoryThrows=false, finalizationError=false }={}) {
  const calls=[];
  const db={
    rpc: async(name,args)=>{calls.push([name,args]);return {data:name==='rg_ensure_seasons'?'active':true,error:finalizationError&&name==='rg_finalize_season'?{code:'P0001'}:null};},
    from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{season_rewards_v2_enabled:true},error:null}),lte:async()=>({data:[{id:'ended'}],error:null})};return q;},
  };
  const route=loadSource('app/api/cron/rg-ecosystem/route.ts',{
    '@/lib/rg/phase2/database':{createPhase2AdminClient:()=>{if(factoryThrows)throw new Error('Missing credential');return db;}},
    '@/lib/rg/phase2/direct-earning':{reconcileVerifiedRgEarnings:async()=>({enabled:false,issued:0})},
    '@/lib/rg/phase2/youtube':{refreshRgYoutubeMilestones:async()=>({checked:0,viewSnapshots:0,milestonesRecorded:0})},
    '@/lib/rg/phase2/publication-scores':{reconcileRgPublicationScores:async()=>({checked:1,capped:0})},
  });
  return {...route,calls};
}
const request=(token)=>new Request('http://localhost/api/cron/rg-ecosystem',{headers:token?{Authorization:token}:{}});
test('actual cron route fails closed without secret, without header and with wrong Bearer',async()=>{
  const saved=process.env.CRON_SECRET;
  try {
    const f=cronFixture();delete process.env.CRON_SECRET;
    assert.equal((await f.GET(request())).status,401);
    process.env.CRON_SECRET='fixture-secret';
    assert.equal((await f.GET(request())).status,401);
    assert.equal((await f.GET(request('Bearer wrong'))).status,401);
    assert.equal(f.calls.length,0);
  } finally {if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved;}
});
test('actual cron route accepts Vercel Bearer header and repeats only idempotent RPC operations',async()=>{
  const saved=process.env.CRON_SECRET;process.env.CRON_SECRET='fixture-secret';
  try {
    const f=cronFixture();for(let i=0;i<2;i++)assert.equal((await f.GET(request('Bearer fixture-secret'))).status,200);
    assert.deepEqual(f.calls.map(([n])=>n),['rg_ensure_seasons','rg_finalize_season','rg_capture_rank_snapshot','rg_ensure_seasons','rg_finalize_season','rg_capture_rank_snapshot']);
  }finally{if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved;}
});
test('actual cron route reports missing credentials/finalization failure instead of claiming success',async()=>{
  const saved=process.env.CRON_SECRET;process.env.CRON_SECRET='fixture-secret';
  try{for(const settings of [{factoryThrows:true},{finalizationError:true}])assert.equal((await cronFixture(settings).GET(request('Bearer fixture-secret'))).status,503);}
  finally{if(saved===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=saved;}
});
test('actual publication sidecar keeps verified link successful when Score RPC errors or throws',async()=>{
  for(const throwing of [false,true]) {
    const calls=[];
    const f=loadSource('lib/rg/publications.ts',{
      '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name)=>{calls.push(name);return {data:'verified-publication',error:null};}})},
      '@/lib/rg/identity':{validateOwnedTrackForPublication:async()=>{},RG_UUID:/.*/,RgIdentityError:class extends Error{}},
      '@/lib/rg/phase2/database':{createPhase2AdminClient:()=>({rpc:async(name)=>{calls.push(name);if(throwing)throw new Error('Score unavailable');return {data:null,error:{code:'PGRST202'}};}})},
    });
    assert.deepEqual(await f.recordConfirmedPublication({userId:'user',artistId:'artist',trackId:'track',beatId:'beat',youtubeExportJobId:'job',youtubeVideoId:'video'}),{linked:true,publicationId:'verified-publication'});
    assert.deepEqual(calls,['record_rg_publication_link','rg_record_score_event']);
  }
});
test('actual wallet/admin metrics routes reject unauthenticated callers before privileged work',async()=>{
  const replacements={'@/lib/auth/server':{getCurrentUser:async()=>null},'@/lib/rg/phase2/database':{createPhase2AdminClient:()=>{throw new Error('Must not run');}},'@/lib/youtube/config':{isYouTubeChannelAdmin:()=>false},'@/lib/rg/phase2/youtube':{refreshRgYoutubeMilestones:async()=>{throw new Error('Must not run');}}};
  assert.equal((await loadSource('app/api/rg/wallet/route.ts',replacements).GET()).status,401);
  assert.equal((await loadSource('app/api/admin/rg/youtube-metrics/route.ts',replacements).POST()).status,403);
});
test('actual reconciliation uses verified publication IDs and canonical stored beat, not client values',async()=>{
  const calls=[];
  const rows={rg_seasons:[{id:'season',starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-10-15T00:00:00Z'}],rg_publication_links:[{id:'publication',track_id:'track',artist_id:'artist'}],rg_tracks:[{id:'track',beat_id:'canonical-beat'}]};
  const db={rpc:async(name,args)=>{calls.push([name,args]);return{data:'season',error:null};},from:(table)=>{const q={then:(fn)=>Promise.resolve({data:rows[table],error:null}).then(fn)};for(const name of ['select','eq','gte','lt','lte','order','range','in','single'])q[name]=()=>q;return q;}};
  const f=loadSource('lib/rg/phase2/publication-scores.ts',{'./database':{createPhase2AdminClient:()=>db}});
  assert.deepEqual(await f.reconcileRgPublicationScores(),{checked:1,capped:0,skipped:0});
  assert.equal(calls[1][0],'rg_record_score_event');assert.equal(calls[1][1].p_beat_id,'canonical-beat');assert.equal(calls[1][1].p_publication_id,'publication');
});

test('actual YouTube parser accepts verified channel statistics and rejects missing/unsafe/fake counts',async()=>{
  const {parseYoutubeMetrics}=loadSource('lib/rg/phase2/youtube-metrics.ts');
  const valid={id:'owned-video',snippet:{channelId:'rg-channel',publishedAt:'2026-10-01T00:00:00Z'},statistics:{viewCount:'5200',likeCount:'100'},status:{uploadStatus:'processed'}};
  assert.deepEqual(parseYoutubeMetrics({items:[valid]},'rg-channel'),[{videoId:'owned-video',viewCount:5200,likeCount:100,publishedAt:'2026-10-01T00:00:00Z',uploadStatus:'processed'}]);
  for(const item of [{...valid,statistics:{}},{...valid,statistics:{viewCount:'9007199254740993'}},{...valid,statistics:{viewCount:'-1'}},{...valid,statistics:{viewCount:5200}},{...valid,snippet:{channelId:'foreign'}},{...valid,status:{uploadStatus:'failed'}}])assert.deepEqual(parseYoutubeMetrics({items:[item]},'rg-channel'),[]);
  assert.throws(()=>parseYoutubeMetrics({},'rg-channel'),/Invalid/);
});

test('actual YouTube collector uses OAuth, canonical IDs, persisted daily counts, and a first-observation baseline',async()=>{
  const {refreshRgYoutubeMilestones}=loadSource('lib/rg/phase2/youtube.ts',{
    './database':{createPhase2AdminClient:()=>db},
    '@/lib/youtube/channel':{getYouTubeChannelSettings:async()=>({channel_id:'rg-channel'}),refreshYouTubeAccessToken:async()=>'fixture-oauth'},
  });
  const calls=[],writes=[],fetches=[];let baseline=null;
  const data={rg_publication_links:[{id:'publication',track_id:'track',artist_id:'artist',youtube_video_id:'owned-video'}],rg_seasons:[{rules_version:1,starts_at:'2026-10-01T00:00:00Z',ends_at:'2026-10-15T00:00:00Z'}],rg_rule_versions:[{version:1,youtube_view_milestones:{1000:{points:3},5000:{points:4}}}],rg_tracks:[{id:'track',beat_id:'canonical-beat'}]};
  const db={rpc:async(name,args)=>{calls.push([name,args]);return{data:'season',error:null};},from:(table)=>{let mode='data';const q={then:(fn)=>Promise.resolve({data:table==='rg_youtube_metric_snapshots'?(mode==='insert'?null:[...(baseline?[{...baseline,observed_day:'2026-10-03',captured_at:'2026-10-03T00:00:00Z'}]:[]),{view_count:5200,observed_day:'2026-10-04',captured_at:'2026-10-04T00:00:00Z'}]):data[table],error:null}).then(fn)};for(const name of ['select','eq','lte','order','range','in','single','limit'])q[name]=()=>q;q.lt=()=>{mode='previous';return q;};q.maybeSingle=()=>q;q.insert=(values)=>{mode='insert';writes.push(values);return q;};return q;}};
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{fetches.push([String(url),options]);return Response.json({items:[{id:'owned-video',snippet:{channelId:'rg-channel'},statistics:{viewCount:'5200'},status:{uploadStatus:'processed'}}]});};
    const first=await refreshRgYoutubeMilestones();assert.equal(first.milestonesRecorded,0);
    baseline={view_count:900};const next=await refreshRgYoutubeMilestones();assert.equal(next.milestonesRecorded,2);
    assert.equal(calls.filter(([name])=>name==='rg_record_score_event').length,2);
    assert.ok(fetches.every(([url,opts])=>new URL(url).searchParams.get('part')==='statistics,snippet,status'&&opts.headers.authorization==='Bearer fixture-oauth'));
    assert.ok(writes.every(v=>v.publication_id==='publication'));
    assert.ok(calls.filter(([name])=>name==='rg_record_score_event').every(([,v])=>v.p_beat_id==='canonical-beat'&&v.p_evidence.view_count===5200));
  } finally {globalThis.fetch=originalFetch;}
});

test('actual Artist/Track routes derive ownership from validated session and reject client status/owner spoofing',async()=>{
  const captured=[];
  const mocks={'@/lib/auth/server':{getCurrentUser:async()=>({id:'session-user'})},'@/lib/rg/identity':{
    createOwnedArtist:async(user,body)=>{captured.push([user,body]);return{id:'artist',user_id:user};},
    createOwnedTrack:async(user,body)=>{captured.push([user,body]);return{id:'track',status:'draft'};},
    serializeIdentityError:()=>({error:'Rejected',status:400}),
  }};
  const make=(body)=>{const req=new Request('http://localhost/api/rg',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost'},body:JSON.stringify(body)});Object.defineProperty(req,'nextUrl',{value:new URL(req.url)});return req;};
  const a=loadSource('app/api/rg/artists/route.ts',mocks),t=loadSource('app/api/rg/tracks/route.ts',mocks);
  assert.equal((await a.POST(make({stageName:'Artist'}))).status,201);
  assert.equal((await a.POST(make({stageName:'Artist',user_id:'foreign'}))).status,400);
  assert.equal((await t.POST(make({artistId:'artist',title:'Track',beatId:'11111111-1111-4111-8111-111111111111'}))).status,201);
  assert.equal((await t.POST(make({artistId:'artist',title:'Track',status:'published'}))).status,400);
  assert.ok(captured.every(([user])=>user==='session-user'));
  // The injected identity layer records arguments; actual ownership/beat checks are exercised by SQL RPC tests.
});

test('actual Studio entitlement route uses customers.studio_access_until; null is demo, admin is permanent bypass',async()=>{
  for(const [expiry,admin,active] of [[null,false,false],['2000-01-01T00:00:00Z',false,false],['2030-01-01T00:00:00Z',false,true],[null,true,true]]){
    const columns=[];const q={select:(value)=>{columns.push(value);return q;},eq:()=>q,maybeSingle:async()=>({data:{studio_access_until:expiry}})};
    const route=loadSource('app/api/studio/access/route.ts',{'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'session-user',email:'fixture@example.invalid'}},error:null})}})},'@/lib/auth/admin':{isSiteAdmin:()=>admin},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>q})}});
    const data=await(await route.GET()).json();assert.equal(data.hasActivePass,active);assert.equal(data.isDemo,!active);
    assert.ok(columns[0].includes('studio_access_until'));if(admin)assert.equal(data.daysRemaining,365);
  }
});

test('persisted YouTube crossings retry after failure, ignore view dips/recovery and exclude past seasons',()=>{
  const {youtubeMilestoneEvidence}=loadSource('lib/rg/phase2/youtube-metrics.ts');
  const observations=[{view_count:900,observed_day:'2026-10-01',captured_at:'2026-10-01T00:00:00Z'},
    {view_count:5200,observed_day:'2026-10-02',captured_at:'2026-10-02T00:00:00Z'},
    {view_count:500,observed_day:'2026-10-03',captured_at:'2026-10-03T00:00:00Z'},
    {view_count:5200,observed_day:'2026-10-04',captured_at:'2026-10-04T00:00:00Z'}];
  const rules={1000:{points:3},5000:{points:4}};
  const events=youtubeMilestoneEvidence(observations,rules,'2026-10-01T00:00:00Z','2026-10-15T00:00:00Z');
  assert.deepEqual(events.map(e=>e.milestone),['1000','5000']);assert.ok(events.every(e=>e.verifiedAt==='2026-10-02T00:00:00Z'));
  assert.deepEqual(youtubeMilestoneEvidence(observations,rules,'2026-10-15T00:00:00Z','2026-10-29T00:00:00Z'),[]);
});

test('actual commerce helper requires an atomic Studio entitlement RPC and never uses a read/update fallback',async()=>{
  const f=loadSource('lib/commerce/fulfillment.ts',{
    '@/lib/supabase/admin':{},'@/lib/stripe/server':{},'@/lib/commerce/cart':{},'@/lib/commerce/contracts':{},'@/lib/r2/client':{},
  });
  const calls=[];const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{studio_access_until:'2030-11-20T00:00:00Z'}}),update:(values)=>{calls.push(values);return q;},then:(fn)=>Promise.resolve({error:null}).then(fn)};
  const live={rpc:async(name,args)=>{assert.equal(name,'rg_extend_studio_access');assert.equal(args.p_customer_id,'customer');return{data:'2030-12-20T00:00:00Z',error:null};},from:()=>q};
  assert.equal(await f.grantStudioAccess(live,'customer',30),'2030-12-20T00:00:00Z');assert.equal(calls.length,0);
  const legacy={rpc:async()=>({data:null,error:{code:'PGRST202'}}),from:()=>q};
  await assert.rejects(()=>f.grantStudioAccess(legacy,'customer',30),/STUDIO_ENTITLEMENT_GRANT_FAILED/);assert.equal(calls.length,0);
  const unavailable={rpc:async()=>({data:null,error:{code:'08006',message:'Fixture unavailable'}}),from:()=>{throw Error('Must not fall back');}};
  await assert.rejects(()=>f.grantStudioAccess(unavailable,'customer',30),/STUDIO_ENTITLEMENT_GRANT_FAILED/);assert.equal(calls.length,0);
});
