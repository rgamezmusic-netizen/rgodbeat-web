"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

export function useAppInstallation() {
  const isInstalled = useInstalledApp();
  const prompt = useRef<InstallPromptEvent | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [status, setStatus] = useState<'idle' | 'prompting' | 'accepted' | 'dismissed' | 'error'>('idle');

  useEffect(() => {
    mounted.current = true;
    const beforeInstall = (event: Event) => {
      const candidate = event as Partial<InstallPromptEvent>;
      if (installedSnapshot() || typeof candidate.prompt !== 'function' || typeof candidate.userChoice?.then !== 'function') return;
      event.preventDefault();
      prompt.current = event as InstallPromptEvent;
      setHasPrompt(true);
      if (!busy.current) setStatus('idle');
    };
    const installed = () => { prompt.current = null; busy.current = false; setHasPrompt(false); setStatus('idle'); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const requestInstall = useCallback(async () => {
    const event = prompt.current;
    if (!event || busy.current || installedSnapshot()) return;
    busy.current = true;
    // A native event is single-use, including when cancelled or rejected.
    prompt.current = null;
    setHasPrompt(false);
    setStatus('prompting');
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (mounted.current) setStatus(choice.outcome === 'accepted' ? 'accepted' : 'dismissed');
    } catch {
      if (mounted.current) setStatus('error');
    } finally {
      busy.current = false;
    }
  }, []);

  return { isInstalled, canInstall: hasPrompt && !isInstalled, isPrompting: status === 'prompting', status, requestInstall };
}
