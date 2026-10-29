"use client";

import { useSyncExternalStore } from 'react';
import { STUDIO_VISUAL_MODE_KEY } from '@/lib/browser/studio-settings';

const eventName = 'rgodbeat:studio-visual-mode';
let temporaryValue: boolean | undefined;

export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (nav.connection?.saveData) return true;
  if (nav.connection?.effectiveType === '2g' || nav.connection?.effectiveType === 'slow-2g') return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return true;
  return false;
}

function snapshot() {
  if (temporaryValue !== undefined) return temporaryValue;
  try {
    const stored = localStorage.getItem(STUDIO_VISUAL_MODE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return isLowEndDevice();
  } catch {
    return isLowEndDevice();
  }
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
