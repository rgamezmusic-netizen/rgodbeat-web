"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Download, Smartphone, X } from 'lucide-react';
import { useDeviceProfile } from '@/hooks/useDeviceProfile';
import { useModalFocus } from '@/hooks/useModalFocus';
import { BROWSER_LABELS, OS_LABELS, type BrowserName, type DeviceOS } from '@/lib/browser/device';
import { getInstallGuide, INSTALL_GUIDE_HIDDEN_KEY } from '@/lib/browser/install-guide';

interface InstallAppModalProps { isOpen: boolean; onClose: () => void; isFirstVisitWelcome?: boolean }
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const readHiddenPreference = () => {
  try { return localStorage.getItem(INSTALL_GUIDE_HIDDEN_KEY) === 'true'; } catch { return false; }
};
const subscribePreference = (listener: () => void) => {
  window.addEventListener('storage', listener);
  window.addEventListener('rgodbeat:install-preference', listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('rgodbeat:install-preference', listener); };
};

export function InstallAppModal({ isOpen, onClose }: InstallAppModalProps) {
  const device = useDeviceProfile();
  const [osOverride, setOsOverride] = useState<DeviceOS | null>(null);
  const [browserOverride, setBrowserOverride] = useState<BrowserName | null>(null);
  const os = osOverride ?? device?.os ?? 'unknown';
  const browser = browserOverride ?? device?.browser ?? 'unknown';
  const guideKey = `${os}:${browser}`;
  const [stepState, setStepState] = useState({ key: guideKey, step: 0 });
  const activeStep = stepState.key === guideKey ? stepState.step : 0;
  const setActiveStep = (step: number) => setStepState({ key: guideKey, step });
  const hidden = useSyncExternalStore(subscribePreference, readHiddenPreference, () => false);
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const installing = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  const handleClose = useCallback(() => { setStepState({ key: '', step: 0 }); onClose(); }, [onClose]);
  useModalFocus(isOpen, dialog, handleClose);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      if (!('prompt' in event) || typeof event.prompt !== 'function' || !('userChoice' in event)) return;
      event.preventDefault(); setDeferredPrompt(event as InstallPromptEvent);
    };
    const installed = () => { setDeferredPrompt(null); handleClose(); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', installed); };
  }, [handleClose]);

  if (!isOpen) return null;
  const guide = getInstallGuide(os, browser);
  const step = guide.steps[activeStep];
  const manual = osOverride !== null || browserOverride !== null;
  const canPrompt = deferredPrompt && !manual;
  const next = async () => {
    if (activeStep < 2) { setActiveStep(activeStep + 1); return; }
    if (!canPrompt) { handleClose(); return; }
    if (installing.current) return;
    installing.current = true;
    const event = deferredPrompt;
    setDeferredPrompt(null);
    try { await event.prompt(); await event.userChoice; } catch { /* The browser may dismiss or invalidate the prompt. */ }
    finally { installing.current = false; handleClose(); }
  };
  return <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm" onClick={handleClose}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="install-title" tabIndex={-1} onClick={event => event.stopPropagation()} className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/15 bg-[#101014] p-5 text-white shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><Smartphone className="mb-3 text-amber-400" size={28} /><h2 id="install-title" className="text-xl font-bold">Instala RGodbeat Studio</h2></div>
        <button type="button" title="Cerrar" aria-label="Cerrar tutorial" onClick={handleClose} className="rounded-xl p-2 hover:bg-white/10"><X size={22} /></button>
      </div>
      <p className="mt-2 text-sm text-amber-300">{manual ? `${OS_LABELS[os]} · ${BROWSER_LABELS[browser]}` : device?.label || 'Detectando dispositivo…'}</p>
      <p className="mt-2 text-sm text-zinc-400">Añade el Studio a tus aplicaciones para abrirlo desde su icono.</p>
      <div className="my-5 flex gap-2" aria-label={`Paso ${activeStep + 1} de 3`}>
        {guide.steps.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= activeStep ? 'bg-amber-400' : 'bg-white/10'}`} />)}
      </div>
      <div aria-live="polite" className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <span className="text-xs font-bold text-amber-400">PASO {activeStep + 1} / 3</span>
        <h3 className="mt-2 text-lg font-bold">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-200">{step.text}</p>
      </div>
      {guide.note && <p className="mt-3 text-xs leading-relaxed text-zinc-400">{guide.note}</p>}
      <details className="mt-4 text-sm text-zinc-300">
        <summary className="cursor-pointer py-2">¿No coincide con tu dispositivo?</summary>
        <p className="mb-3 text-xs text-zinc-400">Algunos navegadores ocultan su identidad. Elige los que utilizas para ver sus pasos.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-xs">Sistema operativo<select aria-label="Sistema operativo" value={os} onChange={event => { setStepState({ key: '', step: 0 }); setOsOverride(event.target.value as DeviceOS); }} className="mt-1 w-full rounded-lg border border-white/20 bg-zinc-900 p-2 text-sm">{Object.entries(OS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="min-w-0 text-xs">Navegador<select aria-label="Navegador" value={browser} onChange={event => { setStepState({ key: '', step: 0 }); setBrowserOverride(event.target.value as BrowserName); }} className="mt-1 w-full rounded-lg border border-white/20 bg-zinc-900 p-2 text-sm">{Object.entries(BROWSER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        {manual && <button type="button" onClick={() => { setStepState({ key: '', step: 0 }); setOsOverride(null); setBrowserOverride(null); }} className="mt-2 py-2 text-amber-300 underline">Detectar automáticamente</button>}
      </details>
      {guide.source && <a href={guide.source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block py-2 text-xs text-zinc-400 underline">Ayuda oficial del navegador</a>}
      <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400"><input type="checkbox" checked={hidden} onChange={event => {
        try { if (event.target.checked) localStorage.setItem(INSTALL_GUIDE_HIDDEN_KEY, 'true'); else localStorage.removeItem(INSTALL_GUIDE_HIDDEN_KEY); } catch { /* Storage may be restricted. */ }
        window.dispatchEvent(new Event('rgodbeat:install-preference'));
      }} className="mt-0.5 accent-amber-400" /><span>No mostrar automáticamente al entrar. Puedes volver desde Proyecto → Instalar App.</span></label>
      <div className="mt-5 flex gap-2">
        {activeStep > 0 && <button type="button" aria-label="Paso anterior" onClick={() => setActiveStep(activeStep - 1)} className="rounded-xl bg-white/10 px-3 hover:bg-white/15"><ArrowLeft size={20} /></button>}
        <button type="button" onClick={() => void next()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-3 text-sm font-bold text-black hover:bg-amber-300">{activeStep < 2 ? 'SIGUIENTE →' : canPrompt ? <><Download size={18} />INSTALAR AHORA →</> : 'LISTO →'}</button>
      </div>
    </section>
  </div>;
}
