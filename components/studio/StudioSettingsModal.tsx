"use client";

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Check, CheckCircle2, Globe, HardDrive, Leaf, Loader2, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import { useModalFocus } from '@/hooks/useModalFocus';
import { clearStudioUICache } from '@/lib/browser/studio-settings';
import { useStudioI18n } from '@/lib/studio/i18n';

interface Props {
  lightVisuals: boolean;
  onChangeLightVisuals: (enabled: boolean) => boolean;
  busyReason: string | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export function StudioSettingsModal({ lightVisuals, onChangeLightVisuals, busyReason, returnFocusRef, onClose }: Props) {
  const { locale, setLocale, t } = useStudioI18n();
  const dialog = useRef<HTMLElement>(null);
  const modeId = useId();
  const langId = useId();
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const mountedRef = useRef(false);
  const [cacheNotice, setCacheNotice] = useState('');
  const [cacheError, setCacheError] = useState(false);
  const [preferenceNotice, setPreferenceNotice] = useState('Se aplican al instante.');
  const [preferenceSaved, setPreferenceSaved] = useState<boolean | null>(null);
  useModalFocus(true, dialog, onClose, returnFocusRef);

  useEffect(() => {
    mountedRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      mountedRef.current = false;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const changeMode = (enabled: boolean) => {
    const saved = onChangeLightVisuals(enabled);
    setPreferenceSaved(saved);
    setPreferenceNotice(saved ? 'Cambios guardados en este dispositivo.' : 'Solo en esta ventana: el navegador no permite guardar el ajuste.');
  };

  const clearCache = async () => {
    if (busyReason || clearingRef.current) return;
    clearingRef.current = true;
    setClearing(true);
    setCacheNotice('');
    setCacheError(false);
    try {
      const result = await clearStudioUICache();
      if (!mountedRef.current) return;
      setCacheNotice(!result.supported ? 'Este navegador no permite limpiar esta caché.'
        : result.cleared ? 'Caché limpiada. Tus proyectos y grabaciones se conservan.'
        : 'Todo listo: la caché ya estaba vacía.');
    } catch {
      if (!mountedRef.current) return;
      setCacheError(true);
      setCacheNotice('No se pudo completar la limpieza. Inténtalo de nuevo.');
    } finally {
      clearingRef.current = false;
      if (mountedRef.current) setClearing(false);
    }
  };

  return <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/80 sm:items-center sm:p-5" onClick={onClose}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="studio-settings-title" aria-describedby="studio-settings-scope"
      onClick={event => event.stopPropagation()} className="studio-settings-panel flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-700/80 bg-[#101014] text-white shadow-2xl sm:rounded-3xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300 min-[360px]:flex"><Settings2 size={21} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p id="studio-settings-scope" className="text-[10px] font-semibold tracking-[0.16em] text-zinc-400">{t.settings.onDevice}</p>
            <h2 id="studio-settings-title" className="mt-0.5 text-lg font-bold leading-tight">{t.settings.title}</h2>
          </div>
        </div>
        <button type="button" aria-label={t.common.close} onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"><X size={21} aria-hidden="true" /></button>
      </header>

      <div className="studio-settings-body min-h-0 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">
        {/* Language Selection */}
        <fieldset>
          <legend className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <Globe size={16} className="text-amber-400" />
            {t.settings.language}
          </legend>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {[
              { val: 'es' as const, title: 'Español', desc: 'Español (Latinoamérica)' },
              { val: 'en' as const, title: 'English', desc: 'English (US)' },
            ].map((item) => {
              const selected = locale === item.val;
              return (
                <label
                  key={item.val}
                  className={`relative flex cursor-pointer flex-col rounded-2xl border p-3.5 transition-all ${
                    selected
                      ? 'border-amber-400/70 bg-amber-400/[0.07]'
                      : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500'
                  }`}
                >
                  <input
                    type="radio"
                    name={langId}
                    value={item.val}
                    checked={selected}
                    onChange={() => setLocale(item.val)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-zinc-200">{item.title}</span>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? 'border-amber-400 bg-amber-400 text-black' : 'border-zinc-600'}`}>
                      {selected && <Check size={11} strokeWidth={3} />}
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-zinc-400">{item.desc}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-zinc-100">{t.settings.visualPerformance}</legend>
          <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 7.5rem), 1fr))' }}>
            {[
              { value: false, title: t.settings.standard, text: t.settings.standardDesc, Icon: Sparkles },
              { value: true, title: t.settings.light, text: t.settings.lightDesc, Icon: Leaf },
            ].map(({ value, title, text, Icon }) => {
              const selected = lightVisuals === value;
              return <label key={title} className={`relative flex cursor-pointer flex-col rounded-2xl border p-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-amber-300 ${selected ? 'border-amber-400/70 bg-amber-400/[0.07]' : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500'}`}>
                <input type="radio" name={modeId} value={String(value)} checked={selected} onChange={() => changeMode(value)} aria-label={title} aria-describedby={`${modeId}-${value}-description`} className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0" />
                <span className="flex items-center justify-between gap-2"><Icon size={20} aria-hidden="true" className={selected ? 'text-amber-300' : 'text-zinc-500'} /><span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? 'border-amber-400 bg-amber-400 text-black' : 'border-zinc-600'}`}>{selected && <Check size={11} strokeWidth={3} />}</span></span>
                <span className={`mt-3 text-sm font-semibold ${selected ? 'text-amber-200' : 'text-zinc-200'}`}>{title}</span>
                <span id={`${modeId}-${value}-description`} className="mt-1 text-xs leading-relaxed text-zinc-400">{text}</span>
              </label>;
            })}
          </div>
        </fieldset>

        <section aria-labelledby="studio-cache-title" className="studio-settings-storage border-t border-white/10 pt-5">
          <div className="flex items-center gap-2"><HardDrive size={17} aria-hidden="true" className="text-zinc-500" /><h3 id="studio-cache-title" className="text-sm font-semibold">{t.settings.storage}</h3></div>
          <div className="mt-3 rounded-2xl border border-zinc-700 bg-zinc-900/40 p-3.5">
            <h4 className="text-sm font-medium text-zinc-200">{t.settings.clearCache}</h4>
            <button type="button" onClick={() => void clearCache()} disabled={Boolean(busyReason) || clearing} aria-describedby={busyReason ? 'studio-cache-busy' : undefined}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-45">
              {clearing ? <Loader2 size={16} aria-hidden="true" className="animate-spin" /> : <Trash2 size={16} aria-hidden="true" />}{clearing ? t.common.loading : t.settings.clearCache}
            </button>
            {busyReason && <p id="studio-cache-busy" className="mt-2 text-xs leading-relaxed text-amber-200">{busyReason}</p>}
            <p role={cacheError ? 'alert' : 'status'} aria-atomic="true" className={`mt-2 text-xs leading-relaxed empty:hidden ${cacheError ? 'text-red-300' : 'text-emerald-300'}`}>{cacheNotice}</p>
          </div>
        </section>
      </div>

      <footer className="flex shrink-0 items-center gap-3 border-t border-white/10 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p role="status" aria-atomic="true" className={`flex min-w-0 flex-1 items-start gap-1.5 text-[11px] leading-relaxed ${preferenceSaved === false ? 'text-amber-200' : 'text-zinc-400'}`}>{preferenceSaved === true && <CheckCircle2 size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-400" />}<span>{preferenceNotice}</span></p>
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-bold text-black hover:bg-amber-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">Listo</button>
      </footer>
    </section>
  </div>;
}
