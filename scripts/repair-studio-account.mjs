// Inspect one explicitly selected account. --repair changes only confirmed damaged
// manifests, after saving their original bytes. It never deletes audio objects.
import { createClient } from '@supabase/supabase-js';
import { S3Client, HeadBucketCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const email = process.argv.find(arg => arg.startsWith('--email='))?.slice(8).trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Specify the authorized account with --email=address.');
const repair = process.argv.includes('--repair');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
let user;
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw new Error(`Account lookup failed: ${error.code || error.name}`);
  user = data.users.find(candidate => candidate.email?.toLowerCase() === email);
  if (user || data.users.length < 1000) break;
}
if (!user || !/^[a-f0-9-]{36}$/i.test(user.id)) throw new Error('The authorized account was not found.');
const prefix = `studio/projects/${user.id}/`;
const raw = process.env.CLOUDFLARE_R2_ACCOUNT_ID.trim();
const endpoint = raw.includes('://') ? raw : `https://${raw}.r2.cloudflarestorage.com`;
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME.trim();
const s3 = new S3Client({ region: 'auto', endpoint, maxAttempts: 1, credentials: {
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID.trim(), secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY.trim(),
} });
const send = command => s3.send(command, { abortSignal: AbortSignal.timeout(20000) });
const backupDirectory = path.join(os.tmpdir(), `rgodbeat-project-repair-${randomUUID()}`);
try {
  await send(new HeadBucketCommand({ Bucket: bucket }));
  for (const name of ['project.json', 'previous-project.json']) {
    let stored;
    try { stored = await send(new GetObjectCommand({ Bucket: bucket, Key: prefix + name })); }
    catch (error) {
      if (error.name === 'NoSuchKey') { console.log(JSON.stringify({ slot: name, state: 'empty' })); continue; }
      throw error;
    }
    const bytes = Buffer.from(await stored.Body.transformToByteArray());
    let project, damaged = false;
    try {
      project = JSON.parse(bytes.toString('utf8'));
      damaged = !project || typeof project !== 'object' || Array.isArray(project)
        || (!project.deleted && (!Array.isArray(project.tracks)
          || project.tracks.some(track => !track || typeof track.id !== 'string' || !Array.isArray(track.clips))));
    } catch { damaged = true; }
    if (!damaged && project.deleted) { console.log(JSON.stringify({ slot: name, state: 'empty' })); continue; }
    const missing = new Set();
    if (!damaged) {
      const keys = [...new Set([project.beat?.customBeatKey, ...project.tracks.flatMap(track => track.clips.map(clip => clip.storageKey))].filter(Boolean))];
      for (const key of keys) {
        if (typeof key !== 'string' || !key.startsWith(prefix)) { missing.add(key); continue; }
        try { await send(new HeadObjectCommand({ Bucket: bucket, Key: key })); }
        catch (error) {
          if (error.$metadata?.httpStatusCode === 404) missing.add(key);
          else throw error; // A permission/network failure is never proof of loss.
        }
      }
    }
    const missingClips = damaged ? 0 : project.tracks.flatMap(track => track.clips).filter(clip => !clip.storageKey || missing.has(clip.storageKey)).length;
    const missingBeat = !damaged && Boolean(project.beat?.customBeatKey && missing.has(project.beat.customBeatKey));
    console.log(JSON.stringify({ slot: name, state: damaged ? 'invalid-manifest' : missingBeat || missingClips ? 'missing-audio' : 'healthy',
      tracks: damaged ? undefined : project.tracks.length, missingClips, missingBeat }));
    if (!repair || (!damaged && !missingClips && !missingBeat)) continue;
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(backupDirectory, name), bytes, { mode: 0o600 });
    const notice = damaged ? 'Se perdió la información del respaldo. Puedes continuar con un proyecto nuevo.'
      : `Se perdió audio del respaldo (${missingClips} tomas${missingBeat ? ' y el beat' : ''}). Se conservó el audio disponible.`;
    const next = damaged ? { deleted: true, beat: null, tracks: [] } : {
      ...project, beat: missingBeat ? null : project.beat,
      tracks: project.tracks.map(track => ({ ...track, clips: track.clips.filter(clip => clip.storageKey && !missing.has(clip.storageKey)) })),
    };
    await send(new PutObjectCommand({ Bucket: bucket, Key: prefix + name,
      Body: Buffer.from(JSON.stringify({ ...next, recoveryNotice: notice, savedAt: Date.now(), commitId: randomUUID() })),
      ContentType: 'application/json', IfMatch: stored.ETag }));
    console.log(JSON.stringify({ slot: name, repaired: true, originalManifest: path.join(backupDirectory, name) }));
  }
} finally { s3.destroy(); }
