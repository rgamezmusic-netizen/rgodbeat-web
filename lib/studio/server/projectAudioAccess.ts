import type { CloudMetadata } from './projectRepository';

export function canReadProjectAudio(project: CloudMetadata, key: string, userPrefix: string): boolean {
  if (project.deleted || !key.startsWith(userPrefix) || key === `${userPrefix}project.json`) return false;
  if (project.beat?.customBeatKey === key) return true;
  return (project.tracks ?? []).some(track => (track.clips ?? []).some(clip => clip.storageKey === key));
}
