"use client";

import { useRef } from 'react';
import { Cloud, FolderOpen, Loader2, RefreshCw, X } from 'lucide-react';
import { useModalFocus } from '@/hooks/useModalFocus';
import type { CloudProjectSlot, CloudProjectSlotInfo } from '@/lib/studio/cloudProject';

interface Props {
  slots: CloudProjectSlotInfo[] | null;
  loading: boolean;
  opening: boolean;
  error: string;
  requiresSignIn: boolean;
  owner: string | null;
  projectId: string;
  onClose: () => void;
  onRefresh: () => void;
  onSignIn: () => void;
  onOpen: (slot: CloudProjectSlot) => void;
}

function savedDate(value?: number): string | null {
  if (!value || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

export function CloudProjectGalleryModal(props: Props) {
  const dialog = useRef<HTMLElement>(null);
  const close = () => { if (!props.opening) props.onClose(); };
  useModalFocus(true, dialog, close);
  const busy = props.loading || props.opening;
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm" onClick={close}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="cloud-gallery-title" tabIndex={-1} onClick={event => event.stopPropagation()} className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/15 bg-[#101014] p-5 text-white shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><Cloud className="mb-3 text-emerald-400" size={28} /><h2 id="cloud-gallery-title" className="text-xl font-bold">Mis proyectos en la nube</h2></div>
        <button type="button" aria-label="Cerrar galería" onClick={close} disabled={props.opening} className="rounded-xl p-2 hover:bg-white/10 disabled:opacity-40"><X size={22} /></button>
      </div>
      <p className="mt-2 text-sm text-zinc-400">Tus dos espacios de guardado. Al abrir un proyecto se protege primero la copia local actual.</p>
      {props.owner && <p className="mt-2 break-all text-xs text-emerald-300">{props.owner}</p>}
      {!props.requiresSignIn && <button type="button" disabled={busy} onClick={props.onRefresh} className="my-4 flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"><RefreshCw size={16} />Actualizar galería</button>}
      {props.loading && <p role="status" className="flex items-center gap-2 py-5 text-sm text-zinc-300"><Loader2 className="animate-spin" size={18} />Consultando tus proyectos…</p>}
      {props.error && <div role="alert" className="my-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200"><p>{props.error}</p><button type="button" disabled={busy} onClick={props.requiresSignIn ? props.onSignIn : props.onRefresh} className="mt-3 underline disabled:opacity-40">{props.requiresSignIn ? 'Iniciar sesión' : 'Reintentar conexión'}</button></div>}
      {!props.loading && !props.error && props.slots && <>
        {!props.slots.some(slot => slot.hasProject) && <p className="my-4 text-sm text-zinc-300">Todavía no tienes proyectos guardados en la nube. Usa Proyecto → Guardar en la Nube para guardar el primero.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {props.slots.map((slot) => {
            const date = savedDate(slot.savedAt);
            return <article key={slot.slot} className="flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/5 p-4">
              <div className="mb-4 flex items-center justify-between gap-2"><FolderOpen className={slot.hasProject ? 'text-emerald-400' : 'text-zinc-600'} size={28} /><span className="text-xs text-zinc-400">Espacio {slot.slot === 'active' ? '1' : '2'}</span></div>
              <h3 className="break-words font-bold">{slot.hasProject ? slot.name || 'Proyecto sin nombre' : 'Espacio vacío'}</h3>
              {slot.hasProject && <div className="mt-2 mb-4 space-y-1 text-xs text-zinc-400">
                {date && <p>Guardado: <time dateTime={new Date(slot.savedAt!).toISOString()}>{date}</time></p>}
                {typeof slot.takesCount === 'number' && <p>{slot.takesCount} {slot.takesCount === 1 ? 'toma' : 'tomas'}</p>}
                {slot.projectId === props.projectId && <p className="text-emerald-300">Proyecto abierto</p>}
              </div>}
              {slot.hasProject ? <button type="button" disabled={busy} onClick={() => props.onOpen(slot.slot)} aria-label={`Abrir ${slot.name || 'Proyecto sin nombre'}, espacio ${slot.slot === 'active' ? '1' : '2'}`} className="mt-auto w-full rounded-xl bg-emerald-400 px-3 py-3 text-sm font-bold text-black hover:bg-emerald-300 disabled:opacity-40">{props.opening ? 'Abriendo…' : 'Abrir proyecto'}</button> : <p className="mt-3 text-xs text-zinc-500">Disponible para guardar un proyecto.</p>}
            </article>;
          })}
        </div>
      </>}
      {props.opening && <p role="status" className="mt-4 text-sm text-emerald-300">Descargando y recuperando el audio…</p>}
    </section>
  </div>;
}
