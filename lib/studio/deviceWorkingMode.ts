function preferenceKey(owner: string | null) {
  return `rgodbeat_studio_device_work_${owner?.trim().toLowerCase() || 'guest'}`;
}

/** A local-only choice applies to this account and project, never another workspace. */
export function prefersDeviceWork(owner: string | null, projectId: string) {
  try { return localStorage.getItem(preferenceKey(owner)) === projectId; }
  catch { return false; }
}

export function rememberDeviceWork(owner: string | null, projectId: string, paused: boolean) {
  try {
    const key = preferenceKey(owner);
    if (paused) localStorage.setItem(key, projectId);
    else if (localStorage.getItem(key) === projectId) localStorage.removeItem(key);
  } catch { /* The current tab still honors the choice when storage is unavailable. */ }
}
