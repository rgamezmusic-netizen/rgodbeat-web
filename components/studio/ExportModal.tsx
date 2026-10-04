import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Download, Mic, Sliders, Music, Sparkles, Check, Activity, Lock, Video, ImagePlus, Loader2, ExternalLink } from 'lucide-react';
import { BeatData, VocalTrack } from '@/lib/studio/types/audio';
import { AudioEngine } from '@/lib/studio/audio/audioEngine';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: AudioEngine | null;
  beat: BeatData | null;
  tracks: VocalTrack[];
  onShowToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  isDemo?: boolean;
  onOpenUnlockModal?: () => void;
}

type YouTubeProgressState = {
  stage: 'render' | 'cover' | 'audio' | 'prepare' | 'publish';
  label: string;
  transferredBytes?: number;
  totalBytes?: number;
};

function formatUploadBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function uploadWithProgress(url: string, body: Blob, method: 'PUT' | 'POST', onProgress: (bytes: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url);
    request.timeout = 120_000;
    request.setRequestHeader('content-type', body.type || 'application/octet-stream');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(body.size, event.loaded));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let message = '';
      try {
        const result = JSON.parse(request.responseText) as { error?: string };
        message = result.error || '';
      } catch { /* Use the phase-specific fallback below. */ }
      reject(new Error(message || `No se pudo completar la subida (${request.status}).`));
    };
    request.onerror = () => reject(new Error('Se interrumpió la conexión durante la subida.'));
    request.ontimeout = () => reject(new Error('La subida tardó demasiado. Comprueba la conexión e inténtalo de nuevo.'));
    request.onabort = () => reject(new Error('La subida fue cancelada.'));
    request.send(body);
  });
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  engine,
  beat,
  tracks,
  onShowToast,
  isDemo = false,
  onOpenUnlockModal,
}) => {
  const [isExportingMaster, setIsExportingMaster] = useState(false);
  const [isExportingRawStems, setIsExportingRawStems] = useState(false);
  const [isExportingWetStems, setIsExportingWetStems] = useState(false);
  const [isExportingBeatStem, setIsExportingBeatStem] = useState(false);
  const exportLock = useRef(false);
  const [sidechainEnabled, setSidechainEnabled] = useState<boolean>(true);
  const [downloadingStemId, setDownloadingStemId] = useState<string | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<{ available: boolean; connected: boolean; channelName?: string; error?: string; maxMasterBytes?: number; maxCoverBytes?: number } | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeProgress, setYoutubeProgress] = useState<YouTubeProgressState | null>(null);
  const [artistName, setArtistName] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [youtubeDescription, setYoutubeDescription] = useState('');
  const [youtubePrivacy, setYoutubePrivacy] = useState<'unlisted' | 'public'>('unlisted');
  const [madeForKids, setMadeForKids] = useState(false);
  const [hasRights, setHasRights] = useState(false);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [youtubeResult, setYoutubeResult] = useState<{ videoUrl: string; privacy: string } | null>(null);

  const isBusy = isExportingMaster || isExportingRawStems || isExportingWetStems || isExportingBeatStem || downloadingStemId !== null || youtubeLoading;
  const youtubeDescriptionBytes = new TextEncoder().encode(youtubeDescription).byteLength;
  const youtubeUploadPercent = youtubeProgress?.totalBytes
    ? Math.min(100, Math.floor(((youtubeProgress.transferredBytes || 0) / youtubeProgress.totalBytes) * 100))
    : null;

  useEffect(() => {
    if (!isOpen || isDemo) return;
    let active = true;
    fetch('/api/studio/youtube/status', { cache: 'no-store' })
      .then(async (res) => ({ res, data: await res.json() }))
      .then(({ data }) => { if (active) setYoutubeStatus(data); })
      .catch(() => { if (active) setYoutubeStatus({ available: false, connected: false }); });
    return () => { active = false; };
  }, [isOpen, isDemo]);

  if (!isOpen) return null;

  if (isDemo) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-lg bg-[#0e0d14] border border-amber-500/40 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <span className="text-[10px] font-mono tracking-[0.2em] text-amber-400 uppercase font-bold">
              MODO DEMO ACTIVO
            </span>
            <h3 className="text-xl sm:text-2xl font-bold font-sans text-white uppercase">
              EXPORTACIÓN EN MASTER WAV BLOQUEADA
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-md mx-auto">
              Has grabado tu maqueta en el estudio. Para descargar el Master WAV 24-bit y los stems vocales separados, activa tu Pase de 30 Días por $10 USD o compra cualquier beat en la tienda (incluye 30 días gratis).
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => {
                onClose();
                if (onOpenUnlockModal) onOpenUnlockModal();
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95 cursor-pointer"
            >
              Activar Pase ($10 USD)
            </button>
            <Link
              href="/beats"
              className="flex-1 py-3 px-4 rounded-xl bg-white/[0.08] hover:bg-purple-600 hover:text-white border border-white/10 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center active:scale-95"
            >
              Comprar Beat (+30d)
            </Link>
          </div>

          <div>
            <button
              onClick={onClose}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono transition-colors cursor-pointer"
            >
              ← Volver al estudio de grabación
            </button>
          </div>
        </div>
      </div>
    );
  }


  const recordedTracks = tracks.filter((t) => t.buffer !== null || (t.clips && t.clips.length > 0));
  const hasRecordings = recordedTracks.length > 0;
  const exportSampleRate = engine?.getExportSampleRate(tracks) ?? 44100;
  const exportRateLabel = `${exportSampleRate / 1000} kHz`;
  const cleanBeatTitle = beat ? beat.title.replace(/[^a-zA-Z0-9]/g, '_') : 'Project';

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // 1. Export a 24-bit Master Mix at the recorded rate with crossover sidechain
  const handleExportMaster = async () => {
    if (!engine || !beat) {
      onShowToast('Carga un beat antes de exportar.', 'error');
      return;
    }

    if (exportLock.current) return;
    exportLock.current = true;
    try {
      setIsExportingMaster(true);
      onShowToast(
        sidechainEnabled
          ? 'Renderizando Master WAV 24-bit con Sidechain...'
          : 'Renderizando Master WAV 24-bit...',
        'info'
      );

      const blob = await engine.exportMix(tracks, {
        enableSidechain: sidechainEnabled,
      });

      const filename = `RGODBEAT_${cleanBeatTitle}_MASTER_24bit_${exportSampleRate}Hz${sidechainEnabled ? '_Sidechain' : ''}.wav`;
      triggerDownload(blob, filename);

      onShowToast(`¡Master descargado: ${filename}!`, 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Error al procesar el master mezclado.', 'error');
    } finally {
      exportLock.current = false;
      setIsExportingMaster(false);
    }
  };

  const handlePublishToYouTube = async () => {
    if (!engine || !beat) {
      onShowToast('Carga un beat antes de publicar.', 'error');
      return;
    }
    if (!youtubeStatus?.available) {
      onShowToast(youtubeStatus?.error || 'La conexión de YouTube todavía no está lista.', 'error');
      return;
    }
    if (!artistName.trim() || !hasRights) {
      onShowToast('Escribe el nombre artístico y confirma los derechos del audio y la imagen.', 'error');
      return;
    }
    if (exportLock.current) return;
    exportLock.current = true;
    const uploadId = window.crypto.randomUUID();
    try {
      setYoutubeLoading(true);
      setYoutubeResult(null);
      setYoutubeProgress({ stage: 'render', label: 'Renderizando el master WAV…' });
      onShowToast('Preparando el master para el canal RGODBEAT…', 'info');
      const blob = await engine.exportMix(tracks, { enableSidechain: sidechainEnabled });
      triggerDownload(blob, `RGODBEAT_${cleanBeatTitle}_MASTER_24bit_${exportSampleRate}Hz${sidechainEnabled ? '_Sidechain' : ''}.wav`);
      if (blob.size > (youtubeStatus.maxMasterBytes || 256_000_000)) throw new Error('El master supera el tamaño máximo para publicarlo. El WAV ya se descargó.');

      if (coverImage) {
        if (coverImage.size > (youtubeStatus.maxCoverBytes || 4_000_000)) throw new Error('La imagen debe pesar menos de 4 MB. El WAV ya se descargó.');
        setYoutubeProgress({ stage: 'cover', label: 'Subiendo la portada a R2…', transferredBytes: 0, totalBytes: coverImage.size });
        await uploadWithProgress(
          `/api/studio/youtube/upload?uploadId=${uploadId}`,
          coverImage,
          'PUT',
          (transferredBytes) => setYoutubeProgress({ stage: 'cover', label: 'Subiendo la portada a R2…', transferredBytes, totalBytes: coverImage.size }),
        ).catch((error: unknown) => { throw error instanceof Error ? error : new Error('No se pudo subir la imagen.'); });
      }

      setYoutubeProgress({ stage: 'audio', label: 'Subiendo el master a R2…', transferredBytes: 0, totalBytes: blob.size });
      const chunkBytes = 2_000_000;
      const totalParts = Math.ceil(blob.size / chunkBytes);
      if (totalParts < 1 || totalParts > 128) throw new Error('El master supera el tamaño máximo. El WAV ya se descargó.');
      for (let index = 0; index < totalParts; index++) {
        const start = index * chunkBytes;
        const part = blob.slice(start, Math.min(start + chunkBytes, blob.size));
        await uploadWithProgress(
          `/api/studio/youtube/upload?uploadId=${uploadId}&action=chunk&index=${index}`,
          part,
          'POST',
          (partBytes) => setYoutubeProgress({ stage: 'audio', label: 'Subiendo el master a R2…', transferredBytes: start + partBytes, totalBytes: blob.size }),
        ).catch((error: unknown) => { throw error instanceof Error ? error : new Error(`Falló la subida del fragmento ${index + 1}. El WAV ya se descargó.`); });
        setYoutubeProgress({ stage: 'audio', label: 'Subiendo el master a R2…', transferredBytes: Math.min(start + part.size, blob.size), totalBytes: blob.size });
      }
      setYoutubeProgress({ stage: 'prepare', label: 'Verificando y preparando el master…' });
      const finish = await fetch(`/api/studio/youtube/upload?uploadId=${uploadId}&action=finish`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parts: totalParts }),
      });
      const finishResult = await finish.json();
      if (!finish.ok) throw new Error(finishResult.error || 'No se pudo completar el master en R2.');

      setYoutubeProgress({ stage: 'publish', label: 'Convirtiendo el vídeo y enviándolo a YouTube…' });
      const response = await fetch('/api/studio/youtube/publish', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadId, artistName: artistName.trim(), videoTitle: youtubeTitle.trim(), videoDescription: youtubeDescription.trim(), beatTitle: beat.title, beatGenre: beat.genre, beatBpm: beat.bpm, beatKey: beat.key, privacy: youtubePrivacy, madeForKids, hasRights, coverUrl: coverImage ? null : beat.coverUrl || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo publicar en YouTube. El WAV ya se descargó.');
      setYoutubeResult({ videoUrl: result.videoUrl, privacy: result.privacy });
      setYoutubeProgress(null);
      onShowToast('Master publicado en el canal RGODBEAT.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo publicar en YouTube. El WAV ya se descargó.';
      setYoutubeProgress(null);
      onShowToast(message, 'error');
    } finally {
      await fetch(`/api/studio/youtube/upload?uploadId=${uploadId}&action=delete`, { method: 'POST' }).catch(() => undefined);
      exportLock.current = false;
      setYoutubeLoading(false);
    }
  };

  // 2. Export original float vocal stems, aligned from 00:00:00 at their recording rate
  const handleExportAllRawStems = async () => {
    if (!engine || !beat) return;
    if (!hasRecordings) {
      onShowToast('No hay grabaciones de voz para exportar como stems.', 'error');
      return;
    }

    if (exportLock.current) return;
    exportLock.current = true;
    try {
      setIsExportingRawStems(true);
      onShowToast('Procesando voces RAW sin efectos...', 'info');

      const stems = await engine.exportVocalRawStems(tracks);
      if (stems.length === 0) {
        onShowToast('No se encontraron tomas con audio grabado.', 'info');
        return;
      }

      for (const stem of stems) {
        triggerDownload(stem.blob, stem.filename);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      onShowToast(`¡${stems.length} Stems de Voces RAW exportados exitosamente!`, 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Error al exportar stems RAW.', 'error');
    } finally {
      exportLock.current = false;
      setIsExportingRawStems(false);
    }
  };

  // 3. Export Single Raw Vocal Stem
  const handleExportSingleRawStem = async (track: VocalTrack) => {
    if (!engine || !beat) return;
    if (exportLock.current) return;
    exportLock.current = true;
    try {
      setDownloadingStemId(`raw-${track.id}`);
      const stems = await engine.exportVocalRawStems([track]);
      if (stems.length > 0) {
        triggerDownload(stems[0].blob, stems[0].filename);
        onShowToast(`¡Stem RAW de ${track.name} exportado sin efectos!`, 'success');
      }
    } catch (err) {
      console.error(err);
      onShowToast(`Error al exportar stem de ${track.name}`, 'error');
    } finally {
      exportLock.current = false;
      setDownloadingStemId(null);
    }
  };

  // 4. Export Processed Wet Stems
  const handleExportAllWetStems = async () => {
    if (!engine || !beat) return;
    if (!hasRecordings) {
      onShowToast('No hay grabaciones de voz para exportar.', 'error');
      return;
    }

    if (exportLock.current) return;
    exportLock.current = true;
    try {
      setIsExportingWetStems(true);
      onShowToast('Renderizando voces con efectos...', 'info');

      const stems = await engine.exportProcessedStems(tracks);
      for (const stem of stems) {
        triggerDownload(stem.blob, stem.filename);
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      onShowToast(`¡${stems.length} Stems procesados (Wet) exportados!`, 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Error al exportar stems procesados.', 'error');
    } finally {
      exportLock.current = false;
      setIsExportingWetStems(false);
    }
  };

  // 5. Export Isolated Beat Stem
  const handleExportBeatStem = async () => {
    if (!engine || !beat) return;
    if (exportLock.current) return;
    exportLock.current = true;
    try {
      setIsExportingBeatStem(true);
      onShowToast('Exportando pista del beat...', 'info');
      const stem = await engine.exportBeatStem(tracks);
      triggerDownload(stem.blob, stem.filename);
      onShowToast('¡Pista del Beat descargada!', 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Error al exportar beat.', 'error');
    } finally {
      exportLock.current = false;
      setIsExportingBeatStem(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Exportar audio" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#121216] border border-zinc-750 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#0d0d10]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-display">
                Centro de Exportación de Audio
              </h2>
              <p className="text-xs text-zinc-400 font-mono">
                {beat ? `${beat.title} • ${beat.bpm} BPM` : 'Proyecto'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          {/* OPTION 1: Master Mezclado WAV con Sidechain */}
          <div className="p-4 rounded-xl bg-gradient-to-b from-amber-500/10 via-zinc-900/60 to-zinc-900/90 border border-amber-500/30 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Recomendado
                  </span>
                  {sidechainEnabled && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono font-semibold">
                      Sidechain Activo
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Master Mezclado Completo (WAV)
                </h3>
              </div>
            </div>

            {/* Sidechain Toggle Button */}
            <div className="p-2.5 rounded-lg bg-black/40 border border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${sidechainEnabled ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <span className="text-xs text-zinc-300 font-medium">
                  {sidechainEnabled
                    ? 'Sidechain Activo (Voz limpia sobre el beat)'
                    : 'Sidechain Desactivado (Plano)'}
                </span>
              </div>

              {/* Dedicated Green Sidechain Toggle Button */}
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setSidechainEnabled(!sidechainEnabled)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all active:scale-95 shadow-sm select-none ${
                  sidechainEnabled
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400 shadow-emerald-500/25'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700'
                }`}
                title="Activar o desactivar el sidechain profesional"
              >
                {sidechainEnabled && <Check className="w-3 h-3 stroke-[3]" />}
                <span>Sidechain {sidechainEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <button
              onClick={handleExportMaster}
              disabled={!beat || isBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-display shadow-lg shadow-amber-500/20 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isExportingMaster ? 'Renderizando el master...' : 'Descargar Master Mezclado (WAV)'}</span>
            </button>

            <div className="rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">Publicar en RGODBEAT YouTube</p>
                    <p className="text-[11px] text-zinc-400">Se crea un vídeo con la carátula y el master mezclado.</p>
                  </div>
                </div>
                {youtubeStatus?.connected && <span className="text-[10px] text-emerald-300">Canal conectado</span>}
              </div>

              <div className="space-y-2">
                <label className="block space-y-1 text-[11px] text-zinc-400">Nombre artístico
                  <input value={artistName} maxLength={80} onChange={(event) => setArtistName(event.target.value)} disabled={isBusy} placeholder="El nombre que aparecerá en el video" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
                </label>
                <label className="block space-y-1 text-[11px] text-zinc-400">Título del vídeo (opcional)
                  <input value={youtubeTitle} maxLength={100} onChange={(event) => setYoutubeTitle(event.target.value)} disabled={isBusy} placeholder={`${artistName.trim() || 'Artista'} - ${beat?.title || 'Beat'} | RGODBEAT`} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
                </label>
                <label className="block space-y-1 text-[11px] text-zinc-400">Descripción (opcional)
                  <textarea value={youtubeDescription} maxLength={5000} rows={3} onChange={(event) => setYoutubeDescription(event.target.value)} disabled={isBusy} placeholder="Si la dejas vacía, se añaden el artista, el beat y sus datos disponibles." className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
                </label>
                <p className={`text-right text-[10px] ${youtubeDescriptionBytes > 5000 ? 'text-red-300' : 'text-zinc-500'}`}>{youtubeDescriptionBytes}/5000 bytes</p>
                <p className="text-[11px] text-zinc-500">Sugerencia de título: {artistName.trim() || 'Artista'} - {beat?.title || 'Beat'} | RGODBEAT. Puedes cambiarla antes de publicar.</p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <p className="text-[11px] text-zinc-400">Imagen: {coverImage?.name || (beat?.coverUrl ? 'carátula del beat' : 'carátula de RGODBEAT')}</p>
                <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[11px] text-zinc-200 hover:border-amber-400">
                  <ImagePlus className="h-3.5 w-3.5" /> Elegir otra imagen
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={isBusy} className="sr-only" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 4_000_000) {
                      onShowToast('La imagen debe pesar menos de 4 MB.', 'error');
                      event.target.value = '';
                      return;
                    }
                    setCoverImage(file);
                  }} />
                </label>
                {coverImage && <button type="button" disabled={isBusy} onClick={() => setCoverImage(null)} className="w-fit text-[11px] text-zinc-500 hover:text-white">Usar carátula del beat</button>}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-zinc-300">
                <label className="inline-flex items-center gap-2"><input type="radio" name="youtubePrivacy" checked={youtubePrivacy === 'unlisted'} onChange={() => setYoutubePrivacy('unlisted')} disabled={isBusy} /> No listado</label>
                <label className="inline-flex items-center gap-2"><input type="radio" name="youtubePrivacy" checked={youtubePrivacy === 'public'} onChange={() => setYoutubePrivacy('public')} disabled={isBusy} /> Público</label>
              </div>
              <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-zinc-400">
                <legend className="mb-1">¿Este vídeo está hecho para niños?</legend>
                <label className="inline-flex items-center gap-2"><input type="radio" name="youtubeKids" checked={!madeForKids} onChange={() => setMadeForKids(false)} disabled={isBusy} /> No</label>
                <label className="inline-flex items-center gap-2"><input type="radio" name="youtubeKids" checked={madeForKids} onChange={() => setMadeForKids(true)} disabled={isBusy} /> Sí</label>
              </fieldset>
              <label className="flex items-start gap-2 text-[10px] leading-4 text-zinc-400">
                <input type="checkbox" checked={hasRights} onChange={(event) => setHasRights(event.target.checked)} disabled={isBusy} className="mt-0.5 accent-amber-400" />
                Confirmo que tengo derechos para publicar esta grabación y la imagen, y que cumple las reglas de YouTube.
              </label>

              {youtubeLoading && youtubeProgress && (
                <div className="space-y-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3" role="status" aria-live="polite">
                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-medium text-zinc-100">{youtubeProgress.label}</span>
                    {youtubeUploadPercent !== null && <span className="shrink-0 font-mono text-amber-300">{youtubeUploadPercent}%</span>}
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-zinc-800"
                    role="progressbar"
                    aria-label={youtubeProgress.label.replace(/…$/, '')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={youtubeUploadPercent ?? undefined}
                    aria-valuetext={youtubeUploadPercent === null ? youtubeProgress.label : `${youtubeUploadPercent}%`}
                  >
                    {youtubeUploadPercent !== null ? (
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-150" style={{ width: `${youtubeUploadPercent}%` }} />
                    ) : (
                      <div className="youtube-progress-indeterminate h-full w-1/3 rounded-full bg-gradient-to-r from-amber-500 to-amber-300" />
                    )}
                  </div>
                  {youtubeProgress.transferredBytes !== undefined && youtubeProgress.totalBytes !== undefined && (
                    <p className="text-right font-mono text-[10px] text-zinc-400">
                      {formatUploadBytes(youtubeProgress.transferredBytes)} / {formatUploadBytes(youtubeProgress.totalBytes)}
                    </p>
                  )}
                </div>
              )}

              {youtubeStatus?.available ? (
                <button type="button" onClick={handlePublishToYouTube} disabled={isBusy || !artistName.trim() || !hasRights || youtubeDescriptionBytes > 5000} className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-45">
                  {youtubeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  {youtubeLoading ? (youtubeProgress?.label || 'Publicando…') : 'Descargar WAV y publicar vídeo'}
                </button>
              ) : (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/80">{youtubeStatus?.error || (youtubeStatus ? 'El canal RGODBEAT aún no está conectado o falta terminar su configuración.' : 'Revisando la conexión del canal…')}</p>
              )}
              {youtubeResult && <a href={youtubeResult.videoUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-300 hover:text-emerald-200">Abrir vídeo ({youtubeResult.privacy === 'private' ? 'privado' : youtubeResult.privacy === 'unlisted' ? 'no listado' : 'público'}) <ExternalLink className="h-3 w-3" /></a>}
            </div>
          </div>

          {/* OPTION 2: Voces RAW como Stems (Dry / Sin Efectos) */}
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                  <Mic className="w-3 h-3" /> Pistas para Mezcla Externa
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Stems de Voces RAW (Dry / Limpias)
                </h3>
              </div>
            </div>

            {hasRecordings ? (
              <div className="space-y-2 pt-1">
                {/* Batch Button */}
                <button
                  onClick={handleExportAllRawStems}
                  disabled={!beat || isBusy}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {isExportingRawStems
                      ? 'Exportando voces RAW...'
                      : `Descargar Todos los Stems RAW (${recordedTracks.length} pistas)`}
                  </span>
                </button>

                {/* Individual Track List */}
                <div className="divide-y divide-zinc-800/80 rounded-lg border border-zinc-800 bg-black/30 overflow-hidden mt-2">
                  {recordedTracks.map((tr) => (
                    <div
                      key={tr.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                        <span className="text-zinc-200 font-medium truncate">{tr.name}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {tr.clips?.length || 1} toma(s)
                        </span>
                      </div>
                      <button
                        onClick={() => handleExportSingleRawStem(tr)}
                        disabled={!beat || isBusy}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white transition-colors text-[11px] font-mono shrink-0"
                      >
                        <Download className="w-3 h-3 text-blue-400" />
                        <span>{downloadingStemId === `raw-${tr.id}` ? '...' : 'Descargar RAW'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 italic p-2 bg-black/20 rounded-lg border border-zinc-850">
                No hay pistas de voz grabadas aún. Graba tomas para habilitar los stems.
              </p>
            )}
          </div>

          {/* OPTION 3: Additional Stems (Wet Stems & Beat Stem) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Processed Wet Stems */}
            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between space-y-2">
              <div>
                <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  Stems Vocales Wet (Con FX)
                </h4>
              </div>
              <button
                onClick={handleExportAllWetStems}
                disabled={!beat || !hasRecordings || isBusy}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium text-xs transition-colors disabled:opacity-40"
              >
                <Download className="w-3 h-3 text-purple-400" />
                <span>{isExportingWetStems ? 'Procesando...' : 'Descargar Stems Wet'}</span>
              </button>
            </div>

            {/* Beat Stem */}
            <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between space-y-2">
              <div>
                <h4 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-amber-400" />
                  Beat Instrumental (WAV)
                </h4>
              </div>
              <button
                onClick={handleExportBeatStem}
                disabled={!beat || isBusy}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-750 text-zinc-200 font-medium text-xs transition-colors disabled:opacity-40"
              >
                <Download className="w-3 h-3 text-amber-400" />
                <span>{isExportingBeatStem ? 'Exportando Beat...' : 'Descargar Beat WAV'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-[#0d0d10] flex items-center justify-between text-xs text-zinc-400">
          <span className="font-mono text-[11px] text-zinc-400">
            WAV · <strong className="text-zinc-200">Master 24-bit · Stems 32-bit float · {exportRateLabel}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
