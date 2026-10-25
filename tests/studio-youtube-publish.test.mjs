// Local route execution with a real WAV -> MP4 render. Google, R2 and database
// are isolated fixtures: this suite cannot publish a video or mutate real data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './helpers/rg-fixtures.mjs';

function wavFixture() {
  const rate=44100, length=rate/4, data=Buffer.alloc(44+length*2);
  data.write('RIFF');data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);
  data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(length*2,40);
  return data;
}
const ids={user:'11111111-1111-4111-8111-111111111111',upload:'22222222-2222-4222-8222-222222222222',artist:'33333333-3333-4333-8333-333333333333',track:'44444444-4444-4444-8444-444444444444'};
const input={uploadId:ids.upload,artistName:'Artista de prueba local',videoTitle:'Prueba local',beatTitle:'Beat local',hasRights:true,madeForKids:false,privacy:'unlisted',rgLink:{artistId:ids.artist,trackId:ids.track,beatId:null}};
const {YouTubeError}=loadSource('lib/youtube/errors.ts');
function fixture({authorizationFailure,googleFailure,cover,persistenceFailure=false}={}) {
  const calls={reservations:0,reads:0,google:0,verified:0,links:[],updates:[],videoBytes:0};
  const wav=wavFixture();
  const config={configured:true,validKey:true,channelId:'channel-fixture'};
  const db={rpc:async()=>{calls.reservations++;return {data:true,error:null}},from:()=>({update(values){calls.updates.push(values);const q={eq:()=>q,select:()=>q,
    maybeSingle:async()=>({data:persistenceFailure?null:{id:ids.upload},error:persistenceFailure?{code:'FIXTURE_PERSISTENCE_FAILED'}:null}),
    then:fn=>Promise.resolve({data:null,error:null}).then(fn)};return q}})};
  const replacement={
    '@/lib/youtube/access':{getAuthorizedStudioExporter:async()=>({user:{id:ids.user},status:200})},
    '@/lib/youtube/channel':{getYouTubeChannelSettings:async()=>({channel_id:config.channelId}),getVerifiedYouTubeAccessToken:async()=>{calls.verified++;if(authorizationFailure)throw new YouTubeError(authorizationFailure);return 'local-access-token'}},
    '@/lib/youtube/config':{youtubeConfig:()=>config},
    '@/lib/youtube/storage':{isYouTubeR2Configured:()=>true,getYouTubeR2Bucket:()=> 'fixture-private',headYouTubeR2:async()=>wav.length,
      getYouTubeR2Client:()=>({send:async()=>{calls.reads++;return {Body:{transformToWebStream:()=>new ReadableStream({start(controller){controller.enqueue(wav);controller.close()}})}}}}),
      readYouTubeR2:async()=>cover||null,clearYouTubeR2:async()=>{}},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/rg/identity':{RG_UUID:/^[0-9a-f-]{36}$/,validateOwnedTrackForPublication:async()=>{},serializeIdentityError:()=>({error:'fixture error',status:400})},
    '@/lib/rg/publications':{recordConfirmedPublication:async values=>{calls.links.push(values);return {linked:true,publicationId:'fixture-publication'}}},
  };
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    calls.google++;
    if(String(url).includes('uploadType=resumable')) {
      if(googleFailure)return Response.json({error:{errors:[{reason:googleFailure}]}},{status:googleFailure==='invalidTitle'?400:403});
      return new Response('',{headers:{location:'https://www.googleapis.com/upload/local-fixture-session'}});
    }
    assert.equal(String(url),'https://www.googleapis.com/upload/local-fixture-session');
    assert.equal(options.method,'PUT');assert.equal(options.headers.authorization,undefined,'session URL, never raw OAuth token in upload body');
    assert.equal(options.body.toString('ascii',4,8),'ftyp','actual ffmpeg MP4 is sent');
    calls.videoBytes=options.body.length;
    return Response.json({id:'fixture-video-id',status:{privacyStatus:'unlisted'}});
  };
  return {calls,publish:loadSource('app/api/studio/youtube/publish/route.ts',replacement).POST,status:loadSource('app/api/studio/youtube/status/route.ts',replacement).GET,
    restore:()=>{globalThis.fetch=original},request:(values={})=>new Request('http://localhost/api/studio/youtube/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...input,...values})})};
}

test('real render creates an MP4, uploads it only after authorization, persists confirmation and links the canonical RG identity',async()=>{
  const f=fixture();try {
    const response=await f.publish(f.request()),result=await response.json();assert.equal(response.status,200);assert.equal(result.success,true);assert.equal(result.rgPublicationLinked,true);
    assert.ok(f.calls.videoBytes>100);assert.equal(f.calls.verified,1);assert.equal(f.calls.reservations,1);assert.equal(f.calls.google,2);
    assert.deepEqual(f.calls.links[0],{userId:ids.user,artistId:ids.artist,trackId:ids.track,beatId:null,youtubeExportJobId:ids.upload,youtubeVideoId:'fixture-video-id'});
    assert.equal(f.calls.updates[0].status,'uploaded');
  } finally {f.restore()}
});
for(const authorizationFailure of ['channelAuthorization','channelMismatch','insufficientPermissions'])test(`${authorizationFailure} blocks render and upload before reserving a job`,async()=>{
  const f=fixture({authorizationFailure});try {
    const response=await f.publish(f.request()),result=await response.json();assert.equal(response.status,503);assert.equal(result.code,authorizationFailure);
    assert.equal(f.calls.reservations,0);assert.equal(f.calls.reads,0);assert.equal(f.calls.google,0);assert.equal(f.calls.links.length,0);
    const status=await f.status(),body=await status.json();assert.equal(body.connected,true);assert.equal(body.available,false);assert.equal(body.authorizationVerified,false);assert.equal(body.code,authorizationFailure);
  } finally {f.restore()}
});
for(const [googleFailure,status,code] of [['quotaExceeded',429,'quotaExceeded'],['insufficientPermissions',503,'insufficientPermissions'],['invalidTitle',400,'invalidVideoMetadata']])test(`Google ${googleFailure} is preserved as an actionable safe error`,async()=>{
  const f=fixture({googleFailure});try {
    const response=await f.publish(f.request()),result=await response.json();assert.equal(response.status,status);assert.equal(result.code,code);assert.equal(f.calls.updates.at(-1).error_code,code);
    assert.equal(f.calls.links.length,0);assert.equal(f.calls.google,1);assert.ok(!JSON.stringify(result).includes('local-access-token'));
  } finally {f.restore()}
});
test('invalid cover keeps its cause and never attempts a YouTube upload',async()=>{
  const f=fixture({cover:Buffer.from('not-an-image')});try {
    const response=await f.publish(f.request()),result=await response.json();assert.equal(response.status,422);assert.equal(result.code,'coverUnavailable');assert.equal(f.calls.google,0);
  } finally {f.restore()}
});
test('YouTube confirmation remains successful if job persistence fails; no points or link are invented',async()=>{
  const f=fixture({persistenceFailure:true});try {
    const response=await f.publish(f.request()),result=await response.json();assert.equal(response.status,200);assert.equal(result.success,true);assert.equal(result.videoId,'fixture-video-id');
    assert.equal(result.rgPublicationLinked,false);assert.equal(f.calls.links.length,0);assert.equal(f.calls.updates.filter(v=>v.status==='failed').length,0);
  } finally {f.restore()}
});
test('status requires live Google verification and keeps personalized data uncached',async()=>{
  const f=fixture();try {
    const response=await f.status(),result=await response.json();assert.equal(result.available,true);assert.equal(result.authorizationVerified,true);assert.equal(f.calls.verified,1);assert.equal(f.calls.google,0);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
  } finally {f.restore()}
});

test('channel probe detects revoked refresh credentials and verifies the authorized channel without uploading',async()=>{
  const originalFetch=globalThis.fetch,priorId=process.env.YOUTUBE_CLIENT_ID,priorSecret=process.env.YOUTUBE_CLIENT_SECRET;
  process.env.YOUTUBE_CLIENT_ID='fixture-client';process.env.YOUTUBE_CLIENT_SECRET='fixture-secret';
  const stored={channel_id:'channel-fixture',encrypted_refresh_token:'fixture-ciphertext'};
  const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:stored,error:null})})};
  const channelModule=loadSource('lib/youtube/channel.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/youtube/config':{youtubeConfig:()=>({channelId:'channel-fixture'})},'@/lib/youtube/credentials':{decryptYouTubeToken:()=> 'fixture-refresh-token'}});
  try {
    globalThis.fetch=async()=>Response.json({error:'invalid_grant'},{status:400});
    await assert.rejects(channelModule.getVerifiedYouTubeAccessToken(),{message:'channelAuthorization'});
    globalThis.fetch=async()=>Response.json({access_token:'fixture-access-token',scope:'https://www.googleapis.com/auth/youtube.readonly'});
    await assert.rejects(channelModule.getVerifiedYouTubeAccessToken(),{message:'insufficientPermissions'});
    const calls=[];
    globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.ok(options.signal);return String(url).includes('oauth2')?Response.json({access_token:'fixture-access-token',scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'}):Response.json({items:[{id:'channel-fixture'}]})};
    assert.equal(await channelModule.getVerifiedYouTubeAccessToken(),'fixture-access-token');assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('/upload/')));
    globalThis.fetch=async url=>String(url).includes('oauth2')?Response.json({access_token:'fixture-access-token',scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'}):Response.json({items:[{id:'wrong-channel'}]});
    await assert.rejects(channelModule.getVerifiedYouTubeAccessToken(),{message:'channelMismatch'});
  } finally {globalThis.fetch=originalFetch;if(priorId===undefined)delete process.env.YOUTUBE_CLIENT_ID;else process.env.YOUTUBE_CLIENT_ID=priorId;if(priorSecret===undefined)delete process.env.YOUTUBE_CLIENT_SECRET;else process.env.YOUTUBE_CLIENT_SECRET=priorSecret}
});
