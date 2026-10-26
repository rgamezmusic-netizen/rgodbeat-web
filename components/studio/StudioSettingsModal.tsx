"use client";

import { useRef, useState } from 'react';
import { Gauge, Loader2, Trash2, X } from 'lucide-react';
import { useModalFocus } from '@/hooks/useModalFocus';
import { clearStudioUICache } from '@/lib/browser/studio-settings';

interface Props {
  lightVisuals: boolean;
  onChangeLightVisuals: (enabled: boolean) => boolean;
  busy: boolean;
  onClose: () => void;
}

export function StudioSettingsModal({ lightVisuals, onChangeLightVisuals, busy, onClose }: Props) {
  const dialog = useRef<HTMLElement>(null);
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  useModalFocus(true, dialog, onClose);

  const clearCache = async () => {
    if (busy || clearingRef.current) return;
    clearingRef.current = true;
    setClearing(true);
    setNotice('');
    setError(false);
    try {
      const result = await clearStudioUICache();
      setNotice(!result.supported ? 'Este navegador no permite gestionar esta caché.'
        : result.cleared ? 'Caché de interfaz borrada. Tus proyectos y grabaciones se conservan.'
        : 'La caché de interfaz ya está vacía.');
    } catch {
      setError(true);
      setNotice('No se pudo completar la limpieza. Puedes intentarlo de nuevo.');
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  };

  return <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" onClick={onClose}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="studio-settings-title"
      onClick={event => event.stopPropagation()} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-zinc-700 bg-[#101014] p-4 text-white shadow-2xl sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="studio-settings-title" className="flex items-center gap-2 text-lg font-bold"><Gauge size={22} className="text-amber-400" />Ajustes de la app</h2>
        <button type="button" aria-label="Cerrar ajustes" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10"><X size={22} /></button>
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-700 p-4">
        <input type="checkbox" checked={lightVisuals} onChange={event => {
          const saved = onChangeLightVisuals(event.target.checked);
          setError(false);
          setNotice(saved ? 'Preferencia guardada en este dispositivo.' : 'Ajuste aplicado a esta ventana; el navegador no permite guardarlo.');
        }} className="mt-1 h-5 w-5 shrink-0 accent-amber-400" />
        <span><span className="block font-semibold">Modo visual ligero</span>
          <span className="mt-1 block text-sm leading-relaxed text-zinc-400">Reduce animaciones, sombras y decoración. Mantiene el audio, los efectos y la calidad de exportación.</span></span>
      </label>
      <div className="mt-4 rounded-2xl border border-zinc-700 p-4">
        <h3 className="font-semibold">Caché de la app</h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">Borra archivos temporales de la interfaz. Conserva beats, proyectos, grabaciones y tu sesión. La interfaz se volverá a descargar cuando la uses.</p>
        <button type="button" onClick={() => void clearCache()} disabled={busy || clearing}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-sm font-semibold hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50">
          {clearing ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}{clearing ? 'Limpiando…' : 'Limpiar caché de la app'}
        </button>
        {busy && <p className="mt-2 text-xs text-amber-200">Pausa la reproducción o termina la grabación antes de limpiar.</p>}
      </div>
      <p role={error ? 'alert' : 'status'} className={`mt-3 text-sm empty:hidden ${error ? 'text-red-300' : 'text-amber-200'}`}>{notice}</p>
    </section>
  </div>;
}
