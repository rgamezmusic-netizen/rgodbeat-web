export const STUDIO_VISUAL_MODE_KEY = 'rgodbeat_studio_visual_light_v1';
export const STUDIO_UI_CACHE_PREFIX = 'rgodbeat-studio-ui-';

// Cache Storage contains only the worker's disposable interface assets.
// Never clear localStorage, IndexedDB, OPFS, registrations or project data here.
export async function clearStudioUICache(): Promise<{ supported: boolean; cleared: number }> {
  if (typeof window === 'undefined' || !('caches' in window)) return { supported: false, cleared: 0 };
  const names = (await window.caches.keys()).filter(name => name.startsWith(STUDIO_UI_CACHE_PREFIX));
  let cleared = 0;
  for (const name of names) {
    if (await window.caches.delete(name)) cleared++;
  }
  return { supported: true, cleared };
}
