import { createHash, randomUUID } from 'node:crypto';
import { decodeProjectManifest } from './projectManifest';

type ClipMeta = { id: string; storageKey?: string; audioHash?: string; downloadUrl?: string };
type TrackMeta = { id: string; clips?: ClipMeta[] };
export type CloudMetadata = {
  beat?: { id?: string; catalogBeatId?: string | null; title?: string; customBeatKey?: string; audioHash?: string; downloadUrl?: string } | null;
  tracks?: TrackMeta[];
  deleted?: boolean;
  savedAt?: number;
  [key: string]: unknown;
};
export interface ProjectStorage {
  read(key: string): Promise<{ body: Buffer | null; etag: string | null }>;
  put(key: string, body: Buffer, contentType: string, expected?: string | null): Promise<string>;
  remove(key: string): Promise<boolean>;
  collect?(prefix: string): Promise<boolean>;
  hasStaged?(key: string, hash: string): Promise<boolean>;
}
export class ProjectConflict extends Error {}
export type StagedAudio = { key: string; hash: string };

function assetKeys(metadata: CloudMetadata): string[] {
  return [...new Set([
    metadata.beat?.customBeatKey,
    ...(metadata.tracks ?? []).flatMap(track => (track.clips ?? []).map(clip => clip.storageKey)),
  ].filter((key): key is string => Boolean(key)))];
}

/** Immutable audio, then a conditional manifest write: failure leaves the previous project intact. */
export async function replaceCloudProject(
  storage: ProjectStorage, prefix: string, expected: string | null,
  metadata: CloudMetadata, files: Map<string, Buffer>, staged = new Map<string, StagedAudio>(),
  manifestName = 'project.json'
): Promise<{ revision: string; savedAt: number; cleanupPending: boolean }> {
  const key = `${prefix}${manifestName}`;
  const previous = await storage.read(key);
  if (previous.etag !== expected) throw new ProjectConflict('El proyecto cambió en otra sesión. El respaldo local se conserva.');
  const old: CloudMetadata = decodeProjectManifest(previous.body).project ?? {};
  const retainedName = manifestName === 'previous-project.json' ? 'project.json' : 'previous-project.json';
  const archivedStored = await storage.read(`${prefix}${retainedName}`);
  const archived: CloudMetadata = decodeProjectManifest(archivedStored.body).project ?? {};
  const reusable = new Map<string, string>();
  for (const project of [old, archived]) {
    if (project.beat?.audioHash && project.beat.customBeatKey?.startsWith(prefix)) reusable.set(project.beat.audioHash, project.beat.customBeatKey);
    for (const track of project.tracks ?? []) for (const clip of track.clips ?? []) {
      if (clip.audioHash && clip.storageKey?.startsWith(prefix)) reusable.set(clip.audioHash, clip.storageKey);
    }
  }
  const uploaded: string[] = [];
  const folder = `${prefix}snapshots/${randomUUID()}/`;
  async function audio(formKey: string, declaredHash?: string) {
    const bytes = files.get(formKey);
    const hash = bytes ? createHash('sha256').update(bytes).digest('hex') : declaredHash;
    if (!hash) throw new Error('Falta audio en el proyecto. El respaldo anterior se conserva.');
    const existing = reusable.get(hash);
    if (existing) return { key: existing, hash };
    const asset = staged.get(formKey);
    if (asset && asset.hash === hash && asset.key.startsWith(`${prefix}snapshots/`)
      && await storage.hasStaged?.(asset.key, hash)) {
      reusable.set(hash, asset.key);
      return { key: asset.key, hash };
    }
    if (!bytes?.length) throw new Error('Este audio aún no está respaldado. Vuelve a guardar con sus archivos.');
    const audioKey = `${folder}${randomUUID()}.wav`;
    // Include the attempted key in cleanup, including ambiguous transport failures.
    uploaded.push(audioKey);
    await storage.put(audioKey, bytes, 'audio/wav');
    reusable.set(hash, audioKey);
    return { key: audioKey, hash };
  }
  try {
    if (metadata.beat && !metadata.deleted) {
      const asset = await audio('beat_custom', metadata.beat.audioHash);
      metadata.beat.customBeatKey = asset.key; metadata.beat.audioHash = asset.hash;
    }
    for (const track of metadata.tracks ?? []) for (const clip of track.clips ?? []) {
      const asset = await audio(`clip_${track.id}_${clip.id}`, clip.audioHash);
      clip.storageKey = asset.key; clip.audioHash = asset.hash;
    }
    metadata.savedAt = Date.now();
    // Distinct manifest even for rapid identical edits (prevents ABA after deletion).
    metadata.commitId = randomUUID();
    const revision = await storage.put(key, Buffer.from(JSON.stringify(metadata)), 'application/json', expected);
    const currentKeys = new Set([...assetKeys(metadata), ...assetKeys(archived)]);
    const stale = assetKeys(old).filter(assetKey => assetKey.startsWith(prefix) && !currentKeys.has(assetKey));
    const deleted = await Promise.allSettled(stale.map(assetKey => storage.remove(assetKey)));
    let collected = true;
    try { collected = await storage.collect?.(prefix) ?? true; } catch { collected = false; }
    return { revision, savedAt: metadata.savedAt, cleanupPending: !collected || deleted.some(result => result.status === 'rejected' || !result.value) };
  } catch (error) {
    // A timed-out commit may have succeeded. Never delete audio until its outcome is known.
    let committed: CloudMetadata;
    try {
      const latest = await storage.read(key);
      committed = latest.body ? JSON.parse(latest.body.toString('utf8')) : {};
      if (metadata.commitId && committed.commitId === metadata.commitId && latest.etag) {
        return { revision: latest.etag, savedAt: metadata.savedAt!, cleanupPending: true };
      }
    } catch { throw error; }
    const liveKeys = new Set([...assetKeys(committed), ...assetKeys(archived)]);
    await Promise.allSettled(uploaded.filter(assetKey => !liveKeys.has(assetKey)).map(assetKey => storage.remove(assetKey)));
    throw error;
  }
}
