'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Send } from 'lucide-react';
import type { AudioEngine } from '@/lib/studio/audio/audioEngine';
import type { BeatData, VocalTrack } from '@/lib/studio/types/audio';
import { getRenderDuration, getTrackClips } from '@/lib/studio/audio/clipEditing';
import { DELIVERY_CHUNK_BYTES, MAX_DELIVERY_BYTES, MAX_DELIVERY_FILE_BYTES, type DeliveryInput } from '@/lib/studio/deliveries/model';

type PreparedDelivery = { id: string; input: DeliveryInput; blobs: Blob[] };
type Receipt = { id: string; notification: 'sent' | 'pending' };
const bytesLabel = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(150_000), cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar el envío.');
  return data;
}
async function uploadChunk(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', url); request.timeout = 90_000;
        request.setRequestHeader('Content-Type', 'application/octet-stream');
        request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded); };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) { resolve(); return; }
          let message = 'No se pudo subir un fragmento. Reintenta el envío.';
          try { message = JSON.parse(request.responseText).error || message; } catch { /* Non-JSON error response. */ }
          reject(Object.assign(new Error(message), { status: request.status }));
        };
        request.onerror = () => reject(new Error('Se interrumpió la conexión. Reintenta el envío.'));
        request.ontimeout = () => reject(new Error('La conexión tardó demasiado. Reintenta el envío.'));
        request.send(blob);
      });
      return;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (attempt === 2 || (status && status < 500 && status !== 429)) throw error;
      await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
}

export function StemDeliveryForm({ engine, beat, tracks, disabled, onBusyChange }: {
  engine: AudioEngine | null; beat: BeatData; tracks: VocalTrack[]; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const recorded = tracks.filter(track => getTrackClips(track).some(clip => clip.buffer));
  const [selected, setSelected] = useState<string[]>(() => recorded.map(track => track.id));
  const [artist, setArtist] = useState(''), [title, setTitle] = useState(''), [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ available: boolean; contactEmail: string; emailNotifications: boolean } | null>(null);
  const [error, setError] = useState(''), [progress, setProgress] = useState(''), [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<Receipt | null>(null);
  const [prepared, setPrepared] = useState<PreparedDelivery | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    api('/api/studio/deliveries').then(data => { if (active) setStatus(data); })
      .catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    if (busy) window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [busy]);
  const selectedTracks = recorded.filter(track => selected.includes(track.id));
  const duration = getRenderDuration(beat.duration, selectedTracks, beat.bpm);
  const sampleRate = engine?.getExportSampleRate(selectedTracks) || beat.buffer.sampleRate;
  const estimatedBytes = selectedTracks.map(track => 56 + Math.ceil(duration * sampleRate) * 4 * Math.max(1, ...getTrackClips(track).map(clip => clip.buffer.numberOfChannels)));
  const oversized = estimatedBytes.some(bytes => bytes > MAX_DELIVERY_FILE_BYTES) || estimatedBytes.reduce((sum, bytes) => sum + bytes, 0) > MAX_DELIVERY_BYTES;
  const editable = !disabled && !busy && !prepared && !receipt;

  const send = async () => {
    if (!engine || lock.current || !selectedTracks.length || oversized) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError(''); setPercent(0);
    try {
      let draft = prepared;
      if (!draft) {
        setProgress('Preparando voces sin efectos…');
        const stems = await engine.exportVocalRawStems(selectedTracks);
        if (stems.length !== selectedTracks.length) throw new Error('Alguna pista seleccionada no tiene audio. Revisa la selección.');
        const files: DeliveryInput['files'] = [];
        for (let index = 0; index < stems.length; index++) {
          const stem = stems[index], track = selectedTracks.find(track => track.id === stem.trackId)!;
          setProgress(`Verificando ${track.name} (${index + 1}/${stems.length})…`);
          const header = new DataView(await stem.blob.slice(0, 56).arrayBuffer());
          const channels = header.getUint16(22, true), rate = header.getUint32(24, true);
          const digest = await crypto.subtle.digest('SHA-256', await stem.blob.arrayBuffer());
          const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          const clean = (value: string) => value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
          files.push({ id: crypto.randomUUID(), trackId: track.id, name: track.name,
            filename: `${String(index + 1).padStart(2, '0')}_${clean(track.name)}_RAW_${beat.bpm}BPM_${clean(beat.key)}_${clean(beat.scale)}.wav`,
            bytes: stem.blob.size, sha256, channels, sampleRate: rate, durationSeconds: (stem.blob.size - 56) / (rate * channels * 4),
            tuning: { rootKey: track.fx.tune.rootKey, scaleMode: track.fx.tune.scaleMode } });
        }
        draft = { id: crypto.randomUUID(), blobs: stems.map(stem => stem.blob), input: {
          artistName: artist.trim(), title: title.trim(), message: message.trim(),
          project: { beatTitle: beat.title, bpm: beat.bpm, key: beat.key || 'Sin definir', scale: beat.scale || 'Sin definir', durationSeconds: files[0].durationSeconds }, files } };
        setPrepared(draft);
      }
      setProgress('Registrando la entrega…');
      const created = await api('/api/studio/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft.id, ...draft.input }) });
      const root = `/api/studio/deliveries/${draft.id}`;
      if (!created.received) {
        let uploaded = 0;
        const total = draft.blobs.reduce((sum, blob) => sum + blob.size, 0);
        for (let index = 0; index < draft.blobs.length; index++) {
          const blob = draft.blobs[index], file = draft.input.files[index];
          setProgress(`Subiendo ${file.name} (${index + 1}/${draft.blobs.length})…`);
          for (let offset = 0; offset < blob.size; offset += DELIVERY_CHUNK_BYTES) {
            const chunk = blob.slice(offset, offset + DELIVERY_CHUNK_BYTES);
            await uploadChunk(`${root}?file=${file.id}&index=${offset / DELIVERY_CHUNK_BYTES}`, chunk,
              loaded => setPercent(Math.min(99, Math.floor((uploaded + loaded) / total * 100))));
            uploaded += chunk.size;
          }
          setProgress(`Confirmando ${file.name}…`);
          await api(`${root}?file=${file.id}`, { method: 'POST' });
        }
      }
      setProgress('Confirmando recepción de todas las voces…');
      const result = await api(root, { method: 'POST' });
      setReceipt({ id: result.id, notification: result.notification }); setPercent(100);
      setPrepared(null); // Release WAV memory only after durable confirmation.
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo enviar. Puedes reintentar.'); }
    finally { lock.current = false; setBusy(false); onBusyChange(false); setProgress(''); }
  };
  return <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
    <div><h3 className="flex items-center gap-2 text-base font-bold text-white"><Send className="h-4 w-4 text-amber-400" /> Enviar voces a RGODBEAT</h3>
      <p className="mt-1 text-xs text-zinc-400">Entrega privada para mezcla. Las voces se envían sin Auto-Tune ni efectos, alineadas desde 0:00.</p></div>
    {receipt ? <div role="status" className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
      <p className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" /> Voces recibidas en la bandeja privada de RGODBEAT.</p>
      <p className="break-all font-mono">Comprobante: {receipt.id}</p>
      <p>{receipt.notification === 'sent' ? 'El aviso por correo también fue enviado.' : 'Las voces están guardadas. El aviso por correo queda pendiente.'}</p>
    </div> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-zinc-300">Nombre del artista<input value={artist} onChange={event => setArtist(event.target.value)} maxLength={80} disabled={!editable} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label>
        <label className="space-y-1 text-xs text-zinc-300">Nombre del tema<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} disabled={!editable} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label>
      </div>
      {status?.contactEmail && <p className="text-xs text-zinc-400">Contacto de la entrega: <span className="text-zinc-200">{status.contactEmail}</span></p>}
      <div className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-300">
        <p className="font-semibold text-amber-200">{beat.bpm} BPM · {beat.key || 'Tono sin definir'} · {beat.scale || 'Escala sin definir'}</p>
        <p className="mt-1">Se incluyen estos valores del proyecto, la duración y la afinación configurada por pista en una ficha descargable. Revisa el tono y el tempo antes de enviar.</p>
      </div>
      <fieldset disabled={!editable} className="space-y-1"><legend className="mb-2 text-xs text-zinc-400">Selecciona las pistas que quieres enviar</legend>
        {recorded.map(track => <label key={track.id} className="flex items-center gap-2 rounded-lg bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200">
          <input type="checkbox" checked={selected.includes(track.id)} onChange={event => setSelected(current => event.target.checked ? [...current, track.id] : current.filter(id => id !== track.id))} className="accent-amber-400" />{track.name}
        </label>)}
      </fieldset>
      <label className="block space-y-1 text-xs text-zinc-300">Mensaje para RGODBEAT (opcional)<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={2000} rows={2} disabled={!editable} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" /></label>
      <p className="text-[11px] text-zinc-400">{selectedTracks.length} {selectedTracks.length === 1 ? 'pista' : 'pistas'} · Aproximadamente {bytesLabel(estimatedBytes.reduce((sum, bytes) => sum + bytes, 0))}. Mantén la app abierta durante el envío. RAW conserva el ruido de la grabación.</p>
      {oversized && <p role="alert" className="text-xs text-amber-200">Máximo 128 MB por pista y 768 MB por entrega. Selecciona menos pistas o acorta el proyecto.</p>}
      {status && !status.available && <p className="text-xs text-amber-200">El almacenamiento de entregas aún no está configurado.</p>}
      {status?.available && !status.emailNotifications && <p className="text-[11px] text-zinc-400">La entrega llegará al panel privado. El aviso por correo está pendiente de configuración.</p>}
      {busy && <div role="status" aria-live="polite" className="space-y-2 text-xs text-amber-200"><p>{progress} {percent > 0 ? `${percent}%` : ''}</p><progress value={percent} max={100} aria-label="Progreso del envío de voces" className="h-2 w-full accent-amber-400" /></div>}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      {prepared && !busy && <p className="text-xs text-zinc-400">El reintento conserva la misma entrega y sus datos.</p>}
      <button type="button" onClick={() => void send()} disabled={disabled || busy || !status?.available || !artist.trim() || !title.trim() || !selectedTracks.length || oversized}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2.5 text-xs font-bold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy ? 'Enviando voces…' : prepared ? 'Reintentar envío' : 'Enviar voces seleccionadas a RGODBEAT'}
      </button>
      {prepared && !busy && <button type="button" disabled={disabled} onClick={() => { setPrepared(null); setError(''); setPercent(0); }} className="text-xs text-zinc-400 underline">Cambiar datos o selección para una nueva entrega</button>}
    </>}
  </div>;
}
