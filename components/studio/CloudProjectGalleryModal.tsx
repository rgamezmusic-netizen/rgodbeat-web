"use client";

import { useRef, useState } from 'react';
import { Cloud, FolderOpen, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { useModalFocus } from '@/hooks/useModalFocus';
import { useStudioI18n } from '@/lib/studio/i18n';
import type { CloudProjectSlot, CloudProjectSlotInfo } from '@/lib/studio/cloudProject';

interface Props {
  slots: CloudProjectSlotInfo[] | null;
  loading: boolean;
  opening: boolean;
  deletingSlot?: CloudProjectSlot | null;
  error: string;
  requiresSignIn: boolean;
  owner: string | null;
  projectId: string;
  onClose: () => void;
  onRefresh: () => void;
  onSignIn: () => void;
  onOpen: (slot: CloudProjectSlot) => void;
  onDelete?: (slot: CloudProjectSlotInfo) => void;
}

function savedDate(value?: number, locale = 'es'): string | null {
  if (!value || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(locale === 'en' ? 'en-US' : 'es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function CloudProjectGalleryModal(props: Props) {
  const { locale, t } = useStudioI18n();
  const dialog = useRef<HTMLElement>(null);
  const [confirmDeleteSlot, setConfirmDeleteSlot] = useState<CloudProjectSlot | null>(null);
  const isDeleting = Boolean(props.deletingSlot);
  const close = () => { if (!props.opening && !isDeleting) props.onClose(); };
  useModalFocus(true, dialog, close);
  const busy = props.loading || props.opening || isDeleting;
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm" onClick={close}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="cloud-gallery-title" tabIndex={-1} onClick={event => event.stopPropagation()} className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-white/15 bg-[#101014] p-5 text-white shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <div><Cloud className="mb-3 text-emerald-400" size={28} /><h2 id="cloud-gallery-title" className="text-xl font-bold">{t.gallery.title}</h2></div>
        <button type="button" aria-label={t.common.close} onClick={close} disabled={props.opening || isDeleting} className="rounded-xl p-2 hover:bg-white/10 disabled:opacity-40"><X size={22} /></button>
      </div>
      <p className="mt-2 text-sm text-zinc-400">{t.gallery.subtitle}</p>
      {props.owner && <p className="mt-2 break-all text-xs text-emerald-300">{props.owner}</p>}
      {!props.requiresSignIn && <button type="button" disabled={busy} onClick={() => { setConfirmDeleteSlot(null); props.onRefresh(); }} className="my-4 flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"><RefreshCw size={16} />{t.gallery.refresh}</button>}
      {props.loading && <p role="status" className="flex items-center gap-2 py-5 text-sm text-zinc-300"><Loader2 className="animate-spin" size={18} />{t.gallery.querying}</p>}
      {props.error && <div role="alert" className="my-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200"><p>{props.error}</p><button type="button" disabled={busy} onClick={props.requiresSignIn ? props.onSignIn : props.onRefresh} className="mt-3 underline disabled:opacity-40">{props.requiresSignIn ? t.topBar.login : t.common.confirm}</button></div>}
      {!props.loading && !props.error && props.slots && <>
        {!props.slots.some(slot => slot.hasProject) && <p className="my-4 text-sm text-zinc-300">{t.gallery.noProjects}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {props.slots.map((slot) => {
            const date = savedDate(slot.savedAt, locale);
            const slotNumber = slot.slot === 'active' ? '1' : '2';
            const confirmingThis = confirmDeleteSlot === slot.slot;
            const deletingThis = props.deletingSlot === slot.slot;
            return <article key={slot.slot} className="flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white/5 p-4">
              <div className="mb-4 flex items-center justify-between gap-2"><FolderOpen className={slot.hasProject ? 'text-emerald-400' : 'text-zinc-600'} size={28} /><span className="text-xs text-zinc-400">{t.gallery.slot} {slotNumber}</span></div>
              <h3 className="break-words font-bold">{slot.hasProject ? slot.name || t.gallery.unnamedProject : t.gallery.emptySlot}</h3>
              {slot.hasProject && <div className="mt-2 mb-4 space-y-1 text-xs text-zinc-400">
                {date && <p>{t.gallery.saved}: <time dateTime={new Date(slot.savedAt!).toISOString()}>{date}</time></p>}
                {typeof slot.takesCount === 'number' && <p>{slot.takesCount} {slot.takesCount === 1 ? t.common.take : t.common.takes}</p>}
                {slot.projectId === props.projectId && <p className="text-emerald-300">{t.gallery.openBadge}</p>}
              </div>}
              {slot.hasProject ? <div className="mt-auto space-y-2">
                <button type="button" disabled={busy} onClick={() => props.onOpen(slot.slot)} aria-label={`${t.gallery.openProject}: ${slot.name || t.gallery.unnamedProject}`} className="w-full rounded-xl bg-emerald-400 px-3 py-3 text-sm font-bold text-black hover:bg-emerald-300 disabled:opacity-40">{props.opening ? t.gallery.openingProject : t.gallery.openProject}</button>
                {props.onDelete && (confirmingThis ? <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-2.5 space-y-2">
                  <p className="text-xs text-rose-200">{t.gallery.deleteConfirmTitle}</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => { setConfirmDeleteSlot(null); props.onDelete?.(slot); }} className="flex-1 rounded-lg bg-rose-500 px-2.5 py-2 text-xs font-bold text-white hover:bg-rose-400 disabled:opacity-40">{deletingThis ? t.gallery.deleting : t.gallery.yesDelete}</button>
                    <button type="button" disabled={busy} onClick={() => setConfirmDeleteSlot(null)} className="flex-1 rounded-lg border border-white/15 px-2.5 py-2 text-xs text-zinc-200 hover:bg-white/10 disabled:opacity-40">{t.common.cancel}</button>
                  </div>
                </div> : <button type="button" disabled={busy} onClick={() => setConfirmDeleteSlot(slot.slot)} aria-label={`${t.gallery.delete}: ${slot.name || t.gallery.unnamedProject}`} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"><Trash2 size={14} />{deletingThis ? t.gallery.deleting : t.gallery.delete}</button>)}
              </div> : <p className="mt-3 text-xs text-zinc-500">{t.gallery.slotAvailable}</p>}
            </article>;
          })}
        </div>
      </>}
      {props.opening && <p role="status" className="mt-4 text-sm text-emerald-300">{t.gallery.openingAudio}</p>}
      {isDeleting && <p role="status" className="mt-4 text-sm text-rose-300">{t.gallery.deletingAudio}</p>}
    </section>
  </div>;
}
