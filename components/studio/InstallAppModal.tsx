"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Download, Ellipsis, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { useDeviceProfile } from '@/hooks/useDeviceProfile';
import { useModalFocus } from '@/hooks/useModalFocus';
import { useAppInstallation } from '@/hooks/useAppInstallation';
import { BROWSER_LABELS, OS_LABELS, type BrowserName, type DeviceOS } from '@/lib/browser/device';
import { getInstallGuide, INSTALL_GUIDE_HIDDEN_KEY } from '@/lib/browser/install-guide';

interface InstallAppModalProps { isOpen: boolean; onClose: () => void; isFirstVisitWelcome?: boolean }

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
  const installation = useAppInstallation();
  const [showInstructions, setShowInstructions] = useState(false);
  const [osOverride, setOsOverride] = useState<DeviceOS | null>(null);
  const [browserOverride, setBrowserOverride] = useState<BrowserName | null>(null);
  const os = osOverride ?? device?.os ?? 'unknown';
  const browser = browserOverride ?? device?.browser ?? 'unknown';
  const guideKey = `${os}:${browser}`;
  const [stepState, setStepState] = useState({ key: guideKey, step: 0 });
  const activeStep = stepState.key === guideKey ? stepState.step : 0;
  const setActiveStep = (step: number) => setStepState({ key: guideKey, step });
  const hidden = useSyncExternalStore(subscribePreference, readHiddenPreference, () => false);
  const dialog = useRef<HTMLElement>(null);
  const handleClose = useCallback(() => {
    if (installation.isPrompting) return;
    setStepState({ key: '', step: 0 }); setShowInstructions(false); onClose();
  }, [onClose, installation.isPrompting]);
  useModalFocus(isOpen, dialog, handleClose);

  if (!isOpen || typeof document === 'undefined') return null;
  const guide = getInstallGuide(os, browser);
  const step = guide.steps[activeStep];
  const manual = osOverride !== null || browserOverride !== null;
  const canPrompt = installation.canInstall && !manual;
  const quickInstall = canPrompt && !showInstructions;
  const iosGuide = os === 'ios' && browser !== 'in-app';
  const safariGuide = iosGuide && browser === 'safari';
  const lastStep = guide.steps.length - 1;
  const next = () => {
    if (installation.isPrompting) return;
    if (installation.isInstalled) { handleClose(); return; }
    if (quickInstall) { void installation.requestInstall(); return; }
    if (!iosGuide && activeStep < lastStep) { setActiveStep(activeStep + 1); return; }
    handleClose();
  };
  return createPortal(<div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm" onClick={handleClose}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="install-title" tabIndex={-1} onClick={event => event.stopPropagation()} className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/15 bg-[#101014] p-4 text-white shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2"><Smartphone className="shrink-0 text-amber-400" size={22} aria-hidden="true" /><h2 id="install-title" className="text-lg font-bold text-white">Instala RGodbeat Studio</h2></div>
        <button type="button" title="Cerrar" aria-label="Cerrar tutorial" disabled={installation.isPrompting} onClick={handleClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-40"><X size={22} /></button>
      </div>
      <p className="mt-1 text-xs text-amber-300">{manual ? `${OS_LABELS[os]} · ${BROWSER_LABELS[browser]}` : device?.label || 'Detectando dispositivo…'}</p>
      {installation.isInstalled && <p className="mt-3 text-sm text-zinc-300">Studio ya está instalado o abierto como app.</p>}
      {!installation.isInstalled && <>
      {!quickInstall && <>{iosGuide ? <ol className="mt-4 overflow-hidden rounded-2xl border border-amber-400/20 bg-amber-400/5">
        {guide.steps.map((item, index) => <li key={item.title} className={`p-3 ${index > 0 ? 'border-t border-amber-400/20' : ''}`}>
          <h3 className="flex items-start gap-2 text-sm font-bold text-white"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-xs text-black" aria-hidden="true">{index + 1}</span><span className="sr-only">{index + 1}. </span><span className="pt-0.5">{item.title}</span></h3>
          {safariGuide && index === 0 ? <div className="mt-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <span aria-label="Más opciones de Safari" className="flex h-11 w-14 items-center justify-center rounded-full border-2 border-amber-400 bg-zinc-800 text-amber-300"><Ellipsis size={28} aria-hidden="true" /></span>
              <ArrowRight size={18} className="shrink-0 text-amber-300" aria-hidden="true" />
              <span className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3"><Share size={22} aria-hidden="true" />Compartir</span>
            </p>
            <p className="mt-2 flex items-center gap-1 text-xs text-zinc-400">¿Ves <Share size={15} aria-label="Compartir" className="shrink-0" /> en la barra? Tócalo directamente.</p>
          </div> : safariGuide && index === 1 ? <div className="mt-2">
            <p className="flex items-center gap-2 text-sm text-zinc-200"><PlusSquare size={20} aria-hidden="true" className="shrink-0 text-amber-300" />Después, toca <span className="ml-auto rounded-lg bg-amber-400 px-3 py-2 font-bold text-black">Añadir</span></p>
            <p className="mt-2 text-xs text-zinc-400">Si aparece «Abrir como app web», actívalo.</p>
          </div> : <p className="mt-2 text-sm leading-relaxed text-zinc-200">{item.text}</p>}
        </li>)}
      </ol> : <><div className="my-5 flex gap-2" aria-label={`Paso ${activeStep + 1} de ${guide.steps.length}`}>
        {guide.steps.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= activeStep ? 'bg-amber-400' : 'bg-white/10'}`} />)}
      </div>
      <div aria-live="polite" className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <span className="text-xs font-bold text-amber-400">PASO {activeStep + 1} / {guide.steps.length}</span>
        <h3 className="mt-2 text-lg font-bold text-white">{step.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-200">{step.text}</p>
      </div></>}
      {guide.note && <p className="mt-3 text-xs leading-relaxed text-zinc-400">{guide.note}</p>}</>}
      <p role="status" className="mt-3 text-sm text-amber-200 empty:hidden">{installation.isPrompting ? 'Confirma en el aviso de tu navegador…' : installation.status === 'accepted' ? 'Instalación solicitada. El navegador confirmará cuando termine.' : installation.status === 'dismissed' ? 'Puedes instalarlo más tarde desde el menú del navegador.' : installation.status === 'error' ? 'No se pudo abrir la instalación. Sigue los pasos de tu navegador.' : ''}</p>
      {canPrompt && <button type="button" disabled={installation.isPrompting} onClick={() => setShowInstructions(value => !value)} className="mt-2 min-h-11 text-sm text-amber-300 underline">{showInstructions ? 'Usar instalación rápida' : 'Ver instrucciones'}</button>}
      <details className="mt-3 text-sm text-zinc-300">
        <summary className="min-h-11 cursor-pointer py-3">Más ayuda</summary>
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-xs">Sistema operativo<select aria-label="Sistema operativo" value={os} onChange={event => { setStepState({ key: '', step: 0 }); setOsOverride(event.target.value as DeviceOS); }} className="mt-1 w-full rounded-lg border border-white/20 bg-zinc-900 p-2 text-sm">{Object.entries(OS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="min-w-0 text-xs">Navegador<select aria-label="Navegador" value={browser} onChange={event => { setStepState({ key: '', step: 0 }); setBrowserOverride(event.target.value as BrowserName); }} className="mt-1 w-full rounded-lg border border-white/20 bg-zinc-900 p-2 text-sm">{Object.entries(BROWSER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        {manual && <button type="button" onClick={() => { setStepState({ key: '', step: 0 }); setOsOverride(null); setBrowserOverride(null); }} className="mt-2 py-2 text-amber-300 underline">Detectar automáticamente</button>}
      {guide.source && <a href={guide.source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block py-2 text-xs text-zinc-400 underline">Ayuda oficial del navegador</a>}
      <label className="mt-3 flex items-start gap-2 text-xs text-zinc-400"><input type="checkbox" checked={hidden} onChange={event => {
        try { if (event.target.checked) localStorage.setItem(INSTALL_GUIDE_HIDDEN_KEY, 'true'); else localStorage.removeItem(INSTALL_GUIDE_HIDDEN_KEY); } catch { /* Storage may be restricted. */ }
        window.dispatchEvent(new Event('rgodbeat:install-preference'));
      }} className="mt-0.5 accent-amber-400" /><span>No mostrar al entrar</span></label>
      </details>
      </>}
      <div className="mt-2 flex gap-2">
        {!installation.isInstalled && !quickInstall && !iosGuide && activeStep > 0 && <button type="button" aria-label="Paso anterior" disabled={installation.isPrompting} onClick={() => setActiveStep(activeStep - 1)} className="min-h-11 rounded-xl bg-zinc-800 px-3 hover:bg-zinc-700"><ArrowLeft size={20} /></button>}
        <button type="button" disabled={installation.isPrompting} onClick={next} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-3 py-3 text-sm font-bold text-black hover:bg-amber-300 disabled:opacity-50">{installation.isInstalled ? 'VOLVER AL STUDIO' : installation.isPrompting ? 'ESPERANDO CONFIRMACIÓN…' : quickInstall ? <><Download size={18} />INSTALAR AHORA →</> : iosGuide ? 'ENTENDIDO' : activeStep < lastStep ? 'SIGUIENTE →' : 'LISTO →'}</button>
      </div>
    </section>
  </div>, document.body);
}
