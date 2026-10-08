import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadSource } from './helpers/rg-fixtures.mjs';
const { NextRequest } = createRequire(import.meta.url)('next/server');
const owner = { id: 'account-a', email: 'studio@example.invalid' };
const prefix = `studio/projects/${owner.id}/`;

function memoryStorage() {
  const objects = new Map();
  let sequence = 0;
  const storage = {
    async read(key) { return objects.get(key) || { body: null, etag: null }; },
    async put(key, body, _type, expected) {
      assert.equal(objects.get(key)?.etag ?? null, expected, 'writes must use the confirmed revision');
      const etag = `revision-${++sequence}`; objects.set(key, { body, etag }); return etag;
    },
    async remove(key) { objects.delete(key); return true; },
  };
  const seed = (name, body, etag = name) => objects.set(prefix + name,
    { body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)), etag });
  return { storage, objects, seed };
}
function projectRoute(storage) {
  return loadSource('app/api/studio/project/route.ts', {
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: owner }, error: null }) } }) },
    '@/lib/auth/server': { getCurrentUser: async () => owner }, '@/lib/auth/admin': { isSiteAdmin: () => true },
    '@/lib/storage/r2': { getR2Client: () => ({}) }, '@/lib/studio/server/r2ProjectStorage': { r2ProjectStorage: storage },
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('Optional index unavailable'); } },
  });
}

test('a corrupt previous manifest cannot disconnect a healthy current project', async () => {
  const { storage, seed } = memoryStorage();
  seed('project.json', { projectId: 'current', beat: null, tracks: [] });
  seed('previous-project.json', '{broken');
  const response = await projectRoute(storage).GET(new NextRequest('https://local.invalid/api/studio/project'));
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.hasProject, true);
  assert.equal(data.project.projectId, 'current'); assert.equal(data.hasPreviousProject, false);
  assert.match(data.recoveryNotice, /Se perdió/);
});

test('a lost current manifest reports loss and leaves the previous slot available', async () => {
  const { storage, seed } = memoryStorage();
  seed('project.json', 'null', 'damaged-revision');
  seed('previous-project.json', { beat: null, tracks: [], projectId: 'previous' });
  const { GET } = projectRoute(storage);
  const current = await (await GET(new NextRequest('https://local.invalid/api/studio/project'))).json();
  assert.equal(current.hasProject, false); assert.equal(current.projectLost, true);
  assert.equal(current.revision, 'damaged-revision'); assert.equal(current.hasPreviousProject, true);
  const previous = await (await GET(new NextRequest('https://local.invalid/api/studio/project?slot=previous'))).json();
  assert.equal(previous.project.projectId, 'previous');
});

test('a permission failure is permanent, never a lost or empty project', async () => {
  const storage = { read: async () => { throw Object.assign(Error('Denied'), { name: 'AccessDenied' }); } };
  const response = await projectRoute(storage).GET(new NextRequest('https://local.invalid/api/studio/project'));
  const data = await response.json();
  assert.equal(response.status, 503); assert.equal(data.code, 'STORAGE_CONFIGURATION');
  assert.equal(data.retryable, false); assert.equal(data.hasProject, undefined);
  assert.match(data.requestId,/^[a-f0-9-]{36}$/);
});

test('an invalid R2 credential is permanent and does not enter retry mode', () => {
  const { projectServiceError } = loadSource('lib/studio/server/projectManifest.ts');
  const result = projectServiceError(Object.assign(Error('Invalid credential'), {
    name: 'InvalidArgument', $metadata: { httpStatusCode: 400 },
  }));
  assert.equal(result.code, 'STORAGE_CONFIGURATION');
  assert.equal(result.retryable, false);
});

test('editing the previous cloud slot preserves the current slot and shared audio', async () => {
  const { storage, seed, objects } = memoryStorage();
  const shared = prefix + 'shared.wav';
  seed('shared.wav', 'voice');
  seed('project.json', { projectId: 'current', beat: null, tracks: [{ id: 'lead1', clips: [{ id: 'take', storageKey: shared, audioHash: 'shared' }] }] });
  seed('previous-project.json', { projectId: 'previous', beat: null, tracks: [{ id: 'lead1', clips: [{ id: 'take', storageKey: shared, audioHash: 'shared' }] }] });
  const currentBytes = objects.get(prefix + 'project.json').body;
  const form = new FormData();
  form.set('metadata', JSON.stringify({ projectId: 'previous', ownerEmail: owner.email, beat: null, tracks: [] }));
  form.set('baseRevision', 'previous-project.json');
  const response = await projectRoute(storage).POST(new NextRequest('https://local.invalid/api/studio/project?slot=previous', { method: 'POST', body: form }));
  assert.equal(response.status, 200); assert.equal((await response.json()).success, true);
  assert.deepEqual(objects.get(prefix + 'project.json').body, currentBytes);
  assert(objects.has(shared), 'current project still references this audio');
  assert.equal(JSON.parse(objects.get(prefix + 'previous-project.json').body).projectId, 'previous');
});

test('saving after a corrupt manifest repairs that slot without deleting the other project', async () => {
  const { storage, seed, objects } = memoryStorage();
  seed('project.json', '{broken'); seed('previous-project.json', { beat: null, tracks: [], projectId: 'previous' });
  const { replaceCloudProject } = loadSource('lib/studio/server/projectRepository.ts');
  await replaceCloudProject(storage, prefix, 'project.json', { beat: null, tracks: [], projectId: 'new' }, new Map());
  assert.equal(JSON.parse(objects.get(prefix + 'project.json').body).projectId, 'new');
  assert.equal(JSON.parse(objects.get(prefix + 'previous-project.json').body).projectId, 'previous');
});

test('missing stored audio returns a final loss response instead of a retry loop', async () => {
  const key = prefix + 'voice.wav';
  const { GET } = loadSource('app/api/studio/project/audio/route.ts', {
    '@/lib/auth/server': { getCurrentUser: async () => owner },
    '@/lib/studio/server/r2ProjectStorage': { r2ProjectStorage: { read: async () => ({ body: Buffer.from(JSON.stringify({
      beat: null, tracks: [{ id: 'lead1', clips: [{ id: 'take', storageKey: key }] }],
    })) }) } },
    '@/lib/storage/r2': { R2_BUCKET_NAME: 'test', getR2Client: () => ({ send: async () => { throw Object.assign(Error('Missing'), { name: 'NoSuchKey' }); } }) },
  });
  const response = await GET(new NextRequest(`https://local.invalid/api/studio/project/audio?key=${encodeURIComponent(key)}`));
  assert.equal(response.status, 410); assert.equal((await response.json()).code, 'AUDIO_LOST');
});

test('a changed audio account or manifest is not reported as lost audio', async () => {
  let reads = 0;
  const { GET } = loadSource('app/api/studio/project/audio/route.ts', {
    '@/lib/auth/server': {getCurrentUser:async()=>owner},
    '@/lib/studio/server/r2ProjectStorage': {r2ProjectStorage:{read:async()=>{reads++;return {body:null};}}},
    '@/lib/storage/r2': {R2_BUCKET_NAME:'test',getR2Client:()=>({})},
  });
  const url = `https://local.invalid/api/studio/project/audio?key=${encodeURIComponent(prefix+'voice.wav')}`;
  const wrongOwner = await GET(new NextRequest(url,{headers:{'x-studio-owner':'another@example.invalid'}}));
  assert.equal(wrongOwner.status,401); assert.equal(reads,0);
  const changedManifest = await GET(new NextRequest(url,{headers:{'x-studio-owner':owner.email}}));
  assert.equal(changedManifest.status,409); assert.equal((await changedManifest.json()).code,'PROJECT_CHANGED');
});

test('archiving never writes to an account changed during the operation', async () => {
  const { POST } = loadSource('app/api/studio/project/archive/route.ts', {
    '@/lib/auth/server': {getCurrentUser:async()=>owner},
    '@/lib/storage/r2': {getR2Client:()=>({})},
    '@/lib/studio/server/r2ProjectStorage': {r2ProjectStorage:{read:async()=>{throw Error('Must not read another account');}}},
  });
  const response = await POST(new Request('https://local.invalid/api/studio/project/archive',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ownerEmail:'another@example.invalid',baseRevision:null}),
  }));
  assert.equal(response.status,401); assert.equal((await response.json()).code,'SESSION_REQUIRED');
});

test('retries stop after three attempts and never retry permanent failures', () => {
  const { shouldRetryCloud } = loadSource('lib/studio/accountConnection.ts');
  assert.equal(shouldRetryCloud(0, true, true), true);
  assert.equal(shouldRetryCloud(2, true, true), true);
  assert.equal(shouldRetryCloud(3, true, true), false);
  assert.equal(shouldRetryCloud(0, false, true), false);
  assert.equal(shouldRetryCloud(0, true, false), false);
});

test('reconnection renews expired cookies once and verifies the same account', async () => {
  let requests = 0, refreshes = 0;
  const { verifyStudioAccount } = loadSource('lib/studio/accountConnection.ts', {
    '@/lib/auth/request': { fetchAuth: async () => Response.json(++requests === 1
      ? { isLoggedIn: false } : { isLoggedIn: true, email: owner.email }) },
    '@/lib/supabase/client': { createClient: () => ({ auth: { refreshSession: async () => { refreshes++; return { error: null }; } } }) },
  });
  await verifyStudioAccount(owner.email);
  assert.equal(requests, 2); assert.equal(refreshes, 1);
});

test('reconnection to another account cannot resume the previous account project', async () => {
  const { verifyStudioAccount } = loadSource('lib/studio/accountConnection.ts', {
    '@/lib/auth/request': { fetchAuth: async () => Response.json({ isLoggedIn: true, email: 'other@example.invalid' }) },
  });
  await assert.rejects(verifyStudioAccount(owner.email), error => error.code === 'SESSION_REQUIRED' && error.retryable === false);
});

async function clientEnvironment(run) {
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const cloud = loadSource('lib/studio/cloudProject.ts');
  cloud.setCloudProjectUser(owner.email);
  try { await run(cloud); } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
}

test('a platform HTML failure keeps its HTTP status and support reference without exposing its body', async () => {
  await clientEnvironment(async client => {
    client.setCloudProjectUser(owner.email);
    globalThis.fetch = async () => new Response('<html>Platform failure</html>',{
      status:502,headers:{'content-type':'text/html','x-vercel-id':'isolated-request'},
    });
    const result = await client.checkCloudProject();
    assert.equal(result.unavailable,true); assert.equal(result.code,'HTTP_502');
    assert.equal(result.requestId,'isolated-request'); assert.equal(result.retryable,true);
    assert(!result.message.includes('<html>'));
  });
});

test('only the last confirmed revision of the selected project may resume automatically', () => clientEnvironment(async cloud => {
  cloud.confirmCloudProject('local-project', 'revision-1');
  assert.equal(cloud.canResumeCloudProject({ hasProject: true, revision: 'revision-1' }, 'local-project'), true);
  assert.equal(cloud.canResumeCloudProject({ hasProject: true, revision: 'revision-2' }, 'local-project'), false);
  assert.equal(cloud.canResumeCloudProject({ hasProject: true, revision: 'revision-1' }, 'other-project'), false);
  cloud.selectCloudProjectSlot('previous');
  assert.equal(cloud.canResumeCloudProject({ hasProject: true, revision: 'revision-1' }, 'local-project'), false);
}));

test('a missing vocal clip is reported while available voices are recovered', () => clientEnvironment(async cloud => {
  const samples = new Float32Array(44100).fill(0.1);
  const decoded = { duration: 1, length: samples.length, sampleRate: 44100, numberOfChannels: 1, getChannelData: () => samples };
  globalThis.fetch = async url => String(url).includes('/audio/')
    ? String(url).endsWith('lost') ? Response.json({ code: 'AUDIO_LOST' }, { status: 410 }) : new Response(new Uint8Array([1]))
    : Response.json({ isLoggedIn: true, ownerEmail: owner.email, hasProject: true, revision: 'revision-1', project: {
      projectId: 'cloud-project', beat: null, tracks: [{ id: 'lead1', name: 'Lead 1', clips: [
        { id: 'good', downloadUrl: '/audio/good' }, { id: 'lost', downloadUrl: '/audio/lost' },
      ] }],
    } });
  const recovered = await cloud.loadProjectFromCloud({ decodeAudioData: async () => decoded });
  assert.equal(recovered.tracks[0].clips.length, 1); assert.equal(recovered.tracks[0].clips[0].id, 'good');
  assert.equal(recovered.losses.length, 1); assert.equal(recovered.projectId, 'cloud-project');
}));

test('a stalled audio download settles without declaring audio lost', () => clientEnvironment(async cloud => {
  const timer = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay) => timer(callback, delay === 30000 ? 1 : delay);
  globalThis.fetch = async (url, options) => String(url).includes('/audio/')
    ? new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
    : Response.json({ hasProject: true, project: { beat: null, tracks: [{ id: 'lead1', clips: [{ id: 'clip', downloadUrl: '/audio/stalled' }] }] } });
  try { await assert.rejects(cloud.loadProjectFromCloud({}), /descarga tardó demasiado/); }
  finally { globalThis.setTimeout = timer; }
}));


test('the account lists two independent named slots including empty revisions', async () => {
  const {storage,seed} = memoryStorage();
  seed('project.json',{projectId:'one',projectName:'Primero',beat:null,tracks:[]});
  const response = await projectRoute(storage).GET(new NextRequest('https://local.invalid/api/studio/project'));
  const {slots} = await response.json();
  assert.equal(slots.length,2);
  assert.deepEqual(slots.map(slot=>[slot.slot,slot.hasProject,slot.name,slot.revision]),[
    ['active',true,'Primero','project.json'],['previous',false,undefined,null]
  ]);
});

test('a named replacement preserves the other slot and rejects stale revisions', async () => {
  const {storage,seed,objects} = memoryStorage();
  seed('project.json',{projectId:'one',projectName:'Primero',beat:null,tracks:[]});
  seed('previous-project.json',{projectId:'two',projectName:'Segundo',beat:null,tracks:[]});
  const currentBytes = objects.get(prefix+'project.json').body;
  const {POST} = projectRoute(storage);
  const form = new FormData();
  form.set('baseRevision','previous-project.json');
  form.set('metadata',JSON.stringify({projectId:'three',projectName:'  Mi canción  ',beat:null,tracks:[]}));
  const request = () => new NextRequest('https://local.invalid/api/studio/project?slot=previous',{method:'POST',body:form});
  assert.equal((await POST(request())).status,200);
  assert.equal(JSON.parse(objects.get(prefix+'previous-project.json').body).projectName,'Mi canción');
  assert.deepEqual(objects.get(prefix+'project.json').body,currentBytes);
  const retained = objects.get(prefix+'previous-project.json').body;
  assert.equal((await POST(request())).status,409);
  assert.deepEqual(objects.get(prefix+'previous-project.json').body,retained);
});

test('invalid project names never modify a cloud slot', async () => {
  const {storage,seed,objects} = memoryStorage();
  seed('project.json',{projectId:'one',projectName:'Primero',beat:null,tracks:[]});
  const bytes = objects.get(prefix+'project.json').body;
  const {POST} = projectRoute(storage);
  for(const projectName of ['   ','x'.repeat(81),42]) {
    const form=new FormData();form.set('baseRevision','project.json');
    form.set('metadata',JSON.stringify({projectId:'new',projectName,beat:null,tracks:[]}));
    const response=await POST(new NextRequest('https://local.invalid/api/studio/project',{method:'POST',body:form}));
    assert.equal(response.status,400);assert.equal((await response.json()).code,'INVALID_PROJECT_NAME');
    assert.deepEqual(objects.get(prefix+'project.json').body,bytes);
  }
});


test('listing slots cannot grant autosave a newer revision when the chooser is cancelled', async () => {
  await clientEnvironment(async cloud => {
    cloud.selectCloudProjectSlot('active','confirmed-old');
    cloud.confirmCloudProject('open-project','confirmed-old');
    let sentRevision;
    globalThis.fetch = async (_url,init) => {
      if(init?.method==='POST') {
        sentRevision=init.body.get('baseRevision');
        return Response.json({conflict:true,error:'Another session saved'},{status:409});
      }
      return Response.json({isLoggedIn:true,ownerEmail:owner.email,revision:'newer',project:{projectId:'open-project',beat:null,tracks:[]},slots:[
        {slot:'active',hasProject:true,revision:'newer',projectId:'open-project',name:'Otro cambio'},
        {slot:'previous',hasProject:false,revision:null}
      ]});
    };
    const slots=await cloud.listCloudProjectSlots();
    assert.equal(slots[0].revision,'newer');
    assert.deepEqual(cloud.getCloudProjectSelection(),{slot:'active',revision:'confirmed-old'});
    const result=await cloud.saveProjectToCloud([],null,undefined,undefined,'open-project','Mi canción');
    assert.equal(sentRevision,'confirmed-old');assert.equal(result.conflict,true);
  });
});
