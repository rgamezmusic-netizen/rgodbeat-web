"use client";

import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Only browser-confirmed state, in memory for this page. No storage, auth or audio.
let installedThisPage = false;
let standaloneMode: MediaQueryList | undefined;
const getStandaloneMode = () => standaloneMode ??= typeof window.matchMedia === 'function'
  ? window.matchMedia('(display-mode: standalone)') : undefined;
const installedSnapshot = () => installedThisPage || getStandaloneMode()?.matches === true
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const serverSnapshot = () => false;
function subscribeInstalled(listener: () => void) {
  const mode = getStandaloneMode();
  const installed = () => { installedThisPage = true; listener(); };
  if (mode?.addEventListener) mode.addEventListener('change', listener);
  else mode?.addListener?.(listener);
  window.addEventListener('appinstalled', installed);
  return () => {
    if (mode?.removeEventListener) mode.removeEventListener('change', listener);
    else mode?.removeListener?.(listener);
    window.removeEventListener('appinstalled', installed);
  };
}

export function useInstalledApp() {
  return useSyncExternalStore(subscribeInstalled, installedSnapshot, serverSnapshot);
}

type InstallStatus = 'idle' | 'prompting' | 'accepted' | 'dismissed' | 'error';
interface PromptSnapshot { hasPrompt: boolean; status: InstallStatus }
const emptyPrompt: PromptSnapshot = { hasPrompt: false, status: 'idle' };
let promptSnapshot = emptyPrompt;
let nativePrompt: InstallPromptEvent | null = null;
let busy = false;
const promptListeners = new Set<() => void>();
const readPrompt = () => promptSnapshot;
const serverPrompt = () => emptyPrompt;
function updatePrompt(hasPrompt: boolean, status: InstallStatus) {
  promptSnapshot = { hasPrompt, status };
  promptListeners.forEach(listener => listener());
}
function beforeInstall(event: Event) {
  const candidate = event as Partial<InstallPromptEvent>;
  if (busy || installedSnapshot() || typeof candidate.prompt !== 'function' || typeof candidate.userChoice?.then !== 'function') return;
  event.preventDefault();
  nativePrompt = event as InstallPromptEvent;
  updatePrompt(true, 'idle');
}
function installCompleted() {
  nativePrompt = null;
  updatePrompt(false, 'idle');
}
function subscribePrompt(listener: () => void) {
  if (promptListeners.size === 0) {
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installCompleted);
  }
  promptListeners.add(listener);
  return () => {
    promptListeners.delete(listener);
    if (promptListeners.size === 0) {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installCompleted);
    }
  };
}

// One browser offer is shared by every button/dialog in this document and
// survives client navigation. It must only be consumed once, even if declined.
async function requestInstall(): Promise<'accepted' | 'dismissed' | 'error' | undefined> {
  const event = nativePrompt;
  if (!event || busy || installedSnapshot()) return;
  busy = true;
  nativePrompt = null;
  updatePrompt(false, 'prompting');
  try {
    await event.prompt();
    const choice = await event.userChoice;
    updatePrompt(false, installedSnapshot() ? 'idle' : choice.outcome);
    return choice.outcome;
  } catch {
    updatePrompt(false, 'error');
    return 'error';
  } finally {
    busy = false;
  }
}

export function useAppInstallation() {
  const isInstalled = useInstalledApp();
  const { hasPrompt, status } = useSyncExternalStore(subscribePrompt, readPrompt, serverPrompt);
  return { isInstalled, canInstall: hasPrompt && !isInstalled, isPrompting: status === 'prompting', status, requestInstall };
}
