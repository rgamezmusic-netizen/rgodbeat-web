"use client";

import { useState } from 'react';
import { X } from 'lucide-react';
import type { CloudProjectSlot, CloudProjectSlotInfo } from '@/lib/studio/cloudProject';

interface Props {
  initialName: string;
  projectId: string;
  slots: CloudProjectSlotInfo[] | null;
  loading: boolean;
  saving: boolean;
  error: string;
  requiresSignIn: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  onSaveDevice: () => void;
  onSave: (slot: CloudProjectSlotInfo, name: string) => void;
}

export function CloudProjectSaveModal(props: Props) {
  const [name, setName] = useState(props.initialName);
  const [selected, setSelected] = useState<CloudProjectSlot | null>(null);
  const [replace, setReplace] = useState(false);
  const destination = props.slots?.find(slot => slot.slot === selected);
  const needsReplace = Boolean(destination?.hasProject && destination.projectId !== props.projectId);
  const busy = props.loading || props.saving;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="cloud-save-title" className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-white/15 bg-[#101014] p-5 text-white shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="cloud-save-title" className="text-lg font-bold">Guardar en la nube</h2>
          <button type="button" aria-label="Cerrar guardado en nube" disabled={props.saving} onClick={props.onClose} className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-40"><X size={20} /></button>
        </div>
        <label htmlFor="cloud-project-name" className="mb-2 block text-sm text-gray-300">Nombre del proyecto</label>
        <input id="cloud-project-name" autoFocus maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} className="mb-5 w-full rounded-xl border border-white/20 bg-black/30 p-3 outline-none focus:border-amber-400" />
        <p className="mb-2 text-sm text-gray-300">Elige un espacio · 2 por cuenta</p>
        {props.loading && <p role="status" className="py-4 text-sm text-gray-400">Consultando espacios…</p>}
        <div className="space-y-2">
          {(['active', 'previous'] as const).map((slot, index) => {
            const info = props.slots?.find(item => item.slot === slot);
            return <button type="button" key={slot} disabled={!info || busy} aria-pressed={selected === slot} onClick={() => { setSelected(slot); setReplace(false); }} className={`w-full rounded-xl border p-3 text-left disabled:opacity-50 ${selected === slot ? 'border-amber-400 bg-amber-400/10' : 'border-white/15 bg-white/5'}`}>
              <span className="block text-sm font-semibold">Espacio {index + 1}</span>
              <span className="block break-words text-sm text-gray-300">{info ? info.hasProject ? info.name || 'Proyecto sin nombre' : 'Vacío' : 'Sin consultar'}</span>
            </button>;
          })}
        </div>
        {needsReplace && <label className="mt-4 flex items-start gap-3 text-sm text-amber-200">
          <input type="checkbox" checked={replace} disabled={busy} onChange={event => setReplace(event.target.checked)} className="mt-1 accent-amber-400" />
          <span>Eliminar «{destination?.name || 'Proyecto sin nombre'}» y guardar aquí.</span>
        </label>}
        {props.error && <div role="alert" className="mt-4 text-sm text-amber-200"><p>{props.error}</p><button type="button" disabled={busy} onClick={props.requiresSignIn ? props.onSignIn : () => { setReplace(false); props.onRetry(); }} className="mt-2 underline">{props.requiresSignIn ? 'Iniciar sesión' : 'Reintentar conexión'}</button></div>}
        <button type="button" disabled={busy || !destination || !name.trim() || (needsReplace && !replace)} onClick={() => destination && props.onSave(destination, name.trim())} className="mt-5 w-full rounded-xl bg-amber-400 py-3 font-bold text-black disabled:opacity-40">{props.saving ? 'Guardando…' : needsReplace ? 'Eliminar y guardar' : 'Guardar'}</button>
        <button type="button" disabled={props.saving} onClick={props.onSaveDevice} className="mt-3 w-full py-2 text-sm text-gray-300 underline">Guardar en dispositivo</button>
      </section>
    </div>
  );
}
