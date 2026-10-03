import assert from 'node:assert/strict';
import { replaceCloudProject, ProjectConflict, type ProjectStorage, type CloudMetadata } from '../lib/studio/server/projectRepository';
import { canReadProjectAudio } from '../lib/studio/server/projectAudioAccess';

async function main() {
const objects = new Map<string, { body: Buffer; etag: string }>();
let sequence = 0;
let failingAudio = false;
let failCommit = false;
let ambiguousCommit = false;
const storage: ProjectStorage = {
  async read(key) { const value = objects.get(key); return { body: value?.body ?? null, etag: value?.etag ?? null }; },
  async put(key, body, type, expected) {
    if (expected !== undefined && (objects.get(key)?.etag ?? null) !== expected) throw new ProjectConflict('Conflict');
    if (type === 'audio/wav' && failingAudio) throw new Error('Upload interrupted');
    if (type === 'application/json' && failCommit) throw new Error('Commit interrupted');
    const etag = `revision-${++sequence}`;
    objects.set(key, { body, etag });
    if (type === 'application/json' && ambiguousCommit) throw new Error('Connection lost after commit');
    return etag;
  },
  async remove(key) { objects.delete(key); return true; },
};
const prefix = 'studio/projects/account-a/';
const files = new Map([['beat_custom', Buffer.from('beat')], ['clip_lead1_take-a', Buffer.from('voice-a')]]);
const metadata = (): CloudMetadata => ({ beat: { id: 'beat', title: 'Beat' }, tracks: [{ id: 'lead1', clips: [{ id: 'take-a' }] }] });
const initial = await replaceCloudProject(storage, prefix, null, metadata(), files);
assert.equal(objects.size, 3);
const original = objects.get(`${prefix}project.json`)!.body.toString();
const committed: CloudMetadata = JSON.parse(original);
const voiceKey = committed.tracks![0].clips![0].storageKey!;
assert(canReadProjectAudio(committed, voiceKey, prefix));
assert(canReadProjectAudio(committed, committed.beat!.customBeatKey!, prefix));
assert(!canReadProjectAudio(committed, voiceKey, 'studio/projects/account-b/'));
assert(!canReadProjectAudio(committed, `${prefix}other.wav`, prefix));
assert(!canReadProjectAudio({ ...committed, deleted: true }, voiceKey, prefix));
failingAudio = true;
await assert.rejects(() => replaceCloudProject(storage, prefix, initial.revision,
  { beat: null, tracks: [{ id: 'lead1', clips: [{ id: 'new' }] }] }, new Map([['clip_lead1_new', Buffer.from('new-voice')]])));
assert.equal(objects.get(`${prefix}project.json`)!.body.toString(), original, 'failed audio must preserve the previous project');
assert.equal(objects.size, 3, 'failed uploads leave no temporary objects');
failingAudio = false; failCommit = true;
await assert.rejects(() => replaceCloudProject(storage, prefix, initial.revision,
  { beat: null, tracks: [{ id: 'lead1', clips: [{ id: 'new' }] }] }, new Map([['clip_lead1_new', Buffer.from('new-voice')]])));
assert.equal(objects.size, 3, 'failed manifest must clean staged audio');
failCommit = false;
const reused: CloudMetadata = JSON.parse(original);
const second = await replaceCloudProject(storage, prefix, initial.revision, reused, new Map());
assert.equal(objects.size, 3, 'changing FX can reuse confirmed audio without duplicates');
const stagedPrefix = 'studio/projects/account-stage/';
const stagedHash = 'a'.repeat(64);
const stagedKey = `${stagedPrefix}snapshots/550e8400-e29b-41d4-a716-446655440000/${stagedHash}.wav`;
objects.set(stagedKey, { body: Buffer.from('staged'), etag: 'staged' });
storage.hasStaged = async (key, hash) => key === stagedKey && hash === stagedHash;
const staged = await replaceCloudProject(storage, stagedPrefix, null,
  { beat: { id: 'stage-beat', audioHash: stagedHash }, tracks: [] },
  new Map(), new Map([['beat_custom', { key: stagedKey, hash: stagedHash }]]));
assert.equal(JSON.parse(objects.get(`${stagedPrefix}project.json`)!.body.toString()).beat.customBeatKey, stagedKey);
await replaceCloudProject(storage, stagedPrefix, staged.revision, { deleted: true, beat: null, tracks: [] }, new Map());
await assert.rejects(() => replaceCloudProject(storage, prefix, initial.revision, metadata(), files), ProjectConflict);
const blank = await replaceCloudProject(storage, prefix, second.revision, { deleted: true, beat: null, tracks: [] }, new Map());
assert.equal(objects.size, 2, 'new project releases every previous audio object');
await assert.rejects(() => replaceCloudProject(storage, prefix, second.revision, metadata(), files), ProjectConflict);
assert.equal(JSON.parse(objects.get(`${prefix}project.json`)!.body.toString()).deleted, true, 'late save cannot resurrect a cleared workspace');
ambiguousCommit = true;
const recovered = await replaceCloudProject(storage, prefix, blank.revision, metadata(), files);
assert(recovered.revision && recovered.cleanupPending);
assert.equal(objects.size, 4, 'a confirmed-but-timed-out commit keeps its audio');
ambiguousCommit = false;
const other = await replaceCloudProject(storage, 'studio/projects/account-b/', null, metadata(), files);
assert(other.revision);
assert.equal(objects.size, 7, 'account storage is isolated');
console.log('Studio project storage tests passed: atomic replacement, failures, audio reuse, cleanup, conflicts, account isolation.');

}
main().catch(error => { console.error(error); process.exitCode = 1; });
