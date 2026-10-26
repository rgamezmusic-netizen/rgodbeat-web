"use client";

import { useSyncExternalStore } from 'react';
import { STUDIO_VISUAL_MODE_KEY } from '@/lib/browser/studio-settings';

const eventName = 'rgodbeat:studio-visual-mode';
let temporaryValue: boolean | undefined;
function snapshot() {
  if (temporaryValue !== undefined) return temporaryValue;
  try { return localStorage.getItem(STUDIO_VISUAL_MODE_KEY) === 'true'; } catch { return false; }
}
function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STUDIO_VISUAL_MODE_KEY) return;
    temporaryValue = undefined;
    listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(eventName, listener);
  };
}
function setLightVisuals(enabled: boolean): boolean {
  // Even if storage is blocked, the preference works for this document.
  temporaryValue = enabled;
  let persisted = false;
  try {
    localStorage.setItem(STUDIO_VISUAL_MODE_KEY, String(enabled));
    temporaryValue = undefined;
    persisted = true;
  } catch { /* Keep the in-memory choice. */ }
  window.dispatchEvent(new Event(eventName));
  return persisted;
}

export function useStudioVisualMode() {
  const lightVisuals = useSyncExternalStore(subscribe, snapshot, () => false);
  return { lightVisuals, setLightVisuals };
}
