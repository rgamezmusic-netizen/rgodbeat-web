import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { replaceCloudProject, ProjectConflict } from '../lib/studio/server/projectRepository';
import { r2ProjectStorage } from '../lib/studio/server/r2ProjectStorage';
import { deleteR2Prefix, getR2Client, R2_BUCKET_NAME } from '../lib/storage/r2';

async function main() {
  const prefix = `studio/qa/${randomUUID()}/`;
  const files = new Map([['beat_custom', Buffer.from('test-beat')], ['clip_lead1_take', Buffer.from('test-vocal')]]);
  try {
    const first = await replaceCloudProject(r2ProjectStorage, prefix, null,
      { beat: { id: 'test-beat', title: 'Test' }, tracks: [{ id: 'lead1', clips: [{ id: 'take' }] }] }, files);
    const stored = await r2ProjectStorage.read(`${prefix}project.json`);
    assert.equal(stored.etag, first.revision);
    const metadata = JSON.parse(stored.body!.toString('utf8'));
    assert.equal((await r2ProjectStorage.read(metadata.beat.customBeatKey)).body?.toString(), 'test-beat');
    assert.equal((await r2ProjectStorage.read(metadata.tracks[0].clips[0].storageKey)).body?.toString(), 'test-vocal');
    const second = await replaceCloudProject(r2ProjectStorage, prefix, first.revision, metadata, new Map());
    await assert.rejects(() => replaceCloudProject(r2ProjectStorage, prefix, first.revision, metadata, new Map()), ProjectConflict);
    const deleted = await replaceCloudProject(r2ProjectStorage, prefix, second.revision,
      { deleted: true, beat: null, tracks: [] }, new Map());
    assert(deleted.revision);
    assert.equal((await r2ProjectStorage.read(metadata.beat.customBeatKey)).body, null);
    assert.equal((await r2ProjectStorage.read(metadata.tracks[0].clips[0].storageKey)).body, null);
    const stagedBytes = Buffer.from('staged-audio-test');
    const stagedHash = createHash('sha256').update(stagedBytes).digest('hex');
    const stagedKey = `${prefix}snapshots/${randomUUID()}/${stagedHash}.wav`;
    await getR2Client()!.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: stagedKey,
      Body: stagedBytes, ContentType: 'audio/wav', Metadata: { sha256: stagedHash } }));
    assert(await r2ProjectStorage.hasStaged?.(stagedKey, stagedHash));
    const afterStage = await replaceCloudProject(r2ProjectStorage, prefix, deleted.revision,
      { beat: { id: 'staged', audioHash: stagedHash }, tracks: [] }, new Map(),
      new Map([['beat_custom', { key: stagedKey, hash: stagedHash }]]));
    assert(afterStage.revision);
    assert.equal((await r2ProjectStorage.read(stagedKey)).body?.toString(), 'staged-audio-test');
    await replaceCloudProject(r2ProjectStorage, prefix, afterStage.revision,
      { deleted: true, beat: null, tracks: [] }, new Map());

    console.log('R2 live project test passed: save, read, reuse, conflict, staged asset, deletion.');
  } finally {
    if (!await deleteR2Prefix(prefix)) throw new Error('Could not remove isolated R2 test objects.');
  }
}
main().catch(error => { console.error(error.name, error.message); process.exitCode = 1; });
