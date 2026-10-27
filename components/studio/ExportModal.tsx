import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Download, Mic, Sliders, Music, Sparkles, Check, Lock, Video, ImagePlus, Loader2, ExternalLink, ArrowLeft, ArrowRight, Trophy, Coins, Send } from 'lucide-react';
import { BeatData, VocalTrack } from '@/lib/studio/types/audio';
import { AudioEngine } from '@/lib/studio/audio/audioEngine';
import { StemDeliveryForm } from './StemDeliveryForm';
import { useModalFocus } from '@/hooks/useModalFocus';
import { studioVideoMetadata } from '@/lib/youtube/metadata';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { publicationRewardMessages, type PublicationRewards } from '@/lib/rg/publication-rewards';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  engine: AudioEngine | null;
  beat: BeatData | null;
  tracks: VocalTrack[];
  onShowToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  isDemo?: boolean;
  onOpenUnlockModal?: () => void;
  accountArtistName?: string;
}

type YouTubeProgressState = {
  stage: 'participation' | 'render' | 'cover' | 'audio' | 'prepare' | 'publish';
  label: string;
  transferredBytes?: number;
  totalBytes?: number;
};

type RgArtist = { id: string; stage_name: string; slug: string; bio: string | null; status: 'active' | 'suspended' | 'retired' };
type RgTrack = { id: string; title: string; beat_id: string | null; status: 'draft' | 'published' | 'archived' };
const RG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const ExportDialog: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  engine,
  beat,
  tracks,
  onShowToast,
  isDemo = false,
  onOpenUnlockModal,
  accountArtistName = '',
}) => {
  const [isExportingMaster, setIsExportingMaster] = useState(false);
  const [isExportingRawStems, setIsExportingRawStems] = useState(false);
  const [isExportingWetStems, setIsExportingWetStems] = useState(false);
  const [isExportingBeatStem, setIsExportingBeatStem] = useState(false);
  const [isSendingStems, setIsSendingStems] = useState(false);
  const exportLock = useRef(false);
  const router = useRouter();
  const [view, setView] = useState<'choose' | 'youtube' | 'advanced' | 'delivery'>('choose');
  const [downloadingStemId, setDownloadingStemId] = useState<string | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<{ available: boolean; connected: boolean; channelName?: string; error?: string; code?: string; canReconnect?: boolean; maxMasterBytes?: number; maxCoverBytes?: number } | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeProgress, setYoutubeProgress] = useState<YouTubeProgressState | null>(null);
  const [artistNameOverride, setArtistName] = useState<string | null>(null);
  const [youtubeTitleOverride, setYoutubeTitle] = useState<string | null>(null);
  const [youtubeDescriptionOverride, setYoutubeDescription] = useState<string | null>(null);
  const [youtubePrivacy, setYoutubePrivacy] = useState<'unlisted' | 'public'>('unlisted');
  const [madeForKids, setMadeForKids] = useState(false);
  const [hasRights, setHasRights] = useState(false);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [youtubeResult, setYoutubeResult] = useState<{ videoId: string; videoUrl: string; privacy: string; uploadId: string; rgLink?: { artistId: string; trackId: string; beatId: string | null }; rgPublicationLinked?: boolean; rgPublicationError?: string; rewards?: PublicationRewards } | null>(null);
  const [rgArtist, setRgArtist] = useState<RgArtist | null>(null);
  const [rgTracks, setRgTracks] = useState<RgTrack[]>([]);
  const [rgTrackId, setRgTrackId] = useState('');
  const [rgLoading, setRgLoading] = useState(false);
  const [rgError, setRgError] = useState('');
  const [rgIdentityReady, setRgIdentityReady] = useState(false);
  const [connectionCheck, setConnectionCheck] = useState(0);
  const [publishError, setPublishError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const artistName = artistNameOverride ?? rgArtist?.stage_name ?? accountArtistName;
  const automaticMetadata = studioVideoMetadata({ artistName, beatTitle: beat?.title || '', beatGenre: beat?.genre, beatBpm: beat?.bpm, beatKey: beat?.key });
  const youtubeTitle = youtubeTitleOverride ?? automaticMetadata.title;
  const youtubeDescription = youtubeDescriptionOverride ?? automaticMetadata.description;

  const isBusy = isSendingStems || isExportingMaster || isExportingRawStems || isExportingWetStems || isExportingBeatStem || downloadingStemId !== null || youtubeLoading || rgLoading;
  const handleClose = useCallback(() => { if (!isBusy) onClose(); }, [isBusy, onClose]);
  useModalFocus(isOpen, dialog, handleClose);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    content.current?.scrollTo(0, 0);
    if (view !== 'choose') content.current?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
  }, [view]);
  const youtubeDescriptionBytes = new TextEncoder().encode(youtubeDescription).byteLength;
  const youtubeUploadPercent = youtubeProgress?.totalBytes
    ? Math.min(100, Math.floor(((youtubeProgress.transferredBytes || 0) / youtubeProgress.totalBytes) * 100))
    : null;

  useEffect(() => {
    if (!isOpen || isDemo || view !== 'youtube') return;
    let active = true;
    fetch('/api/studio/youtube/status', { cache: 'no-store' })
      .then(async (res) => ({ res, data: await res.json() }))
      .then(({ data }) => { if (active) setYoutubeStatus(data); })
      .catch(() => { if (active) setYoutubeStatus({ available: false, connected: false }); });
    return () => { active = false; };
  }, [isOpen, isDemo, view, connectionCheck]);

  useEffect(() => {
    if (!isOpen || isDemo || view !== 'youtube') return;
    let active = true;
    fetch('/api/rg/artists', { cache: 'no-store' })
      .then(async response => ({ response, data: await response.json() }))
      .then(async ({ response, data }) => {
        if (!active) return;
        if (!response.ok) {
          setRgError(data.error || 'No se pudo cargar tu participación.');
          return;
        }
        setRgArtist(data.artist || null);
        if (data.artist?.id) {
          const tracksResponse = await fetch(`/api/rg/tracks?artistId=${encodeURIComponent(data.artist.id)}`, { cache: 'no-store' });
          const tracksData = await tracksResponse.json();
          if (!active) return;
          if (!tracksResponse.ok) { setRgError(tracksData.error || 'No se pudieron cargar tus canciones.'); return; }
          setRgTracks(tracksData.tracks || []);
        }
        setRgIdentityReady(true);
      })
      .catch(() => { if (active) setRgError('No se pudo consultar la identidad RG.'); });
    return () => { active = false; };
  }, [isOpen, isDemo, view, connectionCheck]);

  if (!isOpen) return null;

  const recordedTracks = tracks.filter((t) => t.buffer !== null || (t.clips && t.clips.length > 0));
  const hasRecordings = recordedTracks.length > 0;
  const cleanBeatTitle = beat ? beat.title.replace(/[^a-zA-Z0-9]/g, '_') : 'Project';
  const currentCatalogBeatId = beat?.catalogBeatId && RG_UUID.test(beat.catalogBeatId) ? beat.catalogBeatId : null;
  const compatibleTracks = rgTracks.filter(track => track.status !== 'archived' && track.beat_id === currentCatalogBeatId);

  // Reuse the existing identity APIs at the final publish click. Opening the
  // form never creates records, and an upload cannot silently lose its RG link.
  const prepareParticipation = async () => {
    if (!rgIdentityReady || rgError) throw new Error(rgError || 'Espera a que cargue tu participación.');
    let artist = rgArtist;
    if (!artist) {
      const response = await fetch('/api/rg/artists', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stageName: artistName.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.artist?.id) throw new Error(data.error || 'No se pudo preparar tu perfil de artista.');
      artist = data.artist as RgArtist;
      setRgArtist(artist);
    }
    if (artist.status !== 'active') throw new Error('Tu perfil de artista no está activo para participar.');
    let track = compatibleTracks.find(item => item.id === rgTrackId);
    if (rgTrackId && !track) throw new Error('Selecciona una canción compatible con este beat.');
    if (!track) {
      const response = await fetch('/api/rg/tracks', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ artistId: artist.id, title: youtubeTitle.trim() || beat?.title, beatId: currentCatalogBeatId }),
      });
      const data = await response.json();
      if (!response.ok || !data.track?.id) throw new Error(data.error || 'No se pudo preparar tu canción para el Top.');
      track = data.track as RgTrack;
      const preparedTrack = track;
      setRgTracks(previous => [...previous.filter(item => item.id !== preparedTrack.id), preparedTrack]);
      setRgTrackId(track.id);
    }
    return { artistId: artist.id, trackId: track.id, beatId: currentCatalogBeatId };
  };

  const openYouTube = () => {
    setYoutubeStatus(null);
    setRgIdentityReady(false);
    setRgError('');
    setView('youtube');
  };

  const retryConnection = () => {
    setYoutubeStatus(null);
    setRgIdentityReady(false);
    setRgError('');
    setConnectionCheck(previous => previous + 1);
  };

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
      onShowToast('Preparando tu canción…', 'info');

      const blob = await engine.exportMix(tracks, {
        enableSidechain: true,
      });

      const filename = `RGODBEAT_${cleanBeatTitle}.wav`;
      triggerDownload(blob, filename);

      onShowToast('Canción lista. Se inició la descarga.', 'success');
    } catch (err) {
      console.error(err);
      onShowToast('No se pudo preparar la canción. Inténtalo de nuevo.', 'error');
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
    if (exportLock.current || youtubeResult) return;
    exportLock.current = true;
    const uploadId = window.crypto.randomUUID();
    try {
      setYoutubeLoading(true);
      setPublishError('');
      setYoutubeProgress({ stage: 'participation', label: 'Preparando tu participación…' });
      const rgLink = await prepareParticipation();
      setYoutubeProgress({ stage: 'render', label: 'Preparando tu canción…' });
      const blob = await engine.exportMix(tracks, { enableSidechain: true });
      if (blob.size > (youtubeStatus.maxMasterBytes || 256_000_000)) throw new Error('El master supera el tamaño máximo permitido para publicarlo.');

      if (coverImage) {
        if (coverImage.size > (youtubeStatus.maxCoverBytes || 4_000_000)) throw new Error('La imagen debe pesar menos de 4 MB.');
        setYoutubeProgress({ stage: 'cover', label: 'Subiendo tu portada…', transferredBytes: 0, totalBytes: coverImage.size });
        await uploadWithProgress(
          `/api/studio/youtube/upload?uploadId=${uploadId}`,
          coverImage,
          'PUT',
          (transferredBytes) => setYoutubeProgress({ stage: 'cover', label: 'Subiendo tu portada…', transferredBytes, totalBytes: coverImage.size }),
        ).catch((error: unknown) => { throw error instanceof Error ? error : new Error('No se pudo subir la imagen.'); });
      }

      setYoutubeProgress({ stage: 'audio', label: 'Subiendo tu canción…', transferredBytes: 0, totalBytes: blob.size });
      const chunkBytes = 2_000_000;
      const totalParts = Math.ceil(blob.size / chunkBytes);
      if (totalParts < 1 || totalParts > 128) throw new Error('El master supera el tamaño máximo permitido.');
      for (let index = 0; index < totalParts; index++) {
        const start = index * chunkBytes;
        const part = blob.slice(start, Math.min(start + chunkBytes, blob.size));
        await uploadWithProgress(
          `/api/studio/youtube/upload?uploadId=${uploadId}&action=chunk&index=${index}`,
          part,
          'POST',
          (partBytes) => setYoutubeProgress({ stage: 'audio', label: 'Subiendo tu canción…', transferredBytes: start + partBytes, totalBytes: blob.size }),
        ).catch((error: unknown) => { throw error instanceof Error ? error : new Error(`Falló la subida del fragmento ${index + 1}.`); });
        setYoutubeProgress({ stage: 'audio', label: 'Subiendo tu canción…', transferredBytes: Math.min(start + part.size, blob.size), totalBytes: blob.size });
      }
      setYoutubeProgress({ stage: 'prepare', label: 'Preparando el vídeo…' });
      const finish = await fetch(`/api/studio/youtube/upload?uploadId=${uploadId}&action=finish`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parts: totalParts }),
      });
      const finishResult = await finish.json();
      if (!finish.ok) throw new Error(finishResult.error || 'No se pudo completar el master en R2.');

      setYoutubeProgress({ stage: 'publish', label: 'Publicando en YouTube…' });
      const response = await fetch('/api/studio/youtube/publish', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uploadId, artistName: artistName.trim(), videoTitle: youtubeTitle.trim(), videoDescription: youtubeDescription.trim(), beatTitle: beat.title, beatGenre: beat.genre, beatBpm: beat.bpm, beatKey: beat.key, privacy: youtubePrivacy, madeForKids, hasRights, coverUrl: coverImage ? null : beat.coverUrl || null,
          rgLink }),
      });
      const result = await response.json();
      if (!response.ok || result.success !== true || !result.videoId || !result.videoUrl) {
        throw new Error(result.error || 'YouTube no confirmó la publicación.');
      }
      setYoutubeResult({ videoId: result.videoId, videoUrl: result.videoUrl, privacy: result.privacy, uploadId,
        rgLink,
        rgPublicationLinked: result.rgPublicationLinked, rgPublicationError: result.rgPublicationError, rewards: result.rgRewards });
      window.dispatchEvent(new Event('rg-wallet-updated'));
      window.dispatchEvent(new Event('rg-publication-updated'));
      router.refresh();
      setYoutubeProgress({ stage: 'publish', label: 'Vídeo cargado y confirmado por YouTube', transferredBytes: 1, totalBytes: 1 });
      content.current?.scrollTo(0, 0);
      onShowToast(result.rgPublicationLinked === true
        ? '¡Tu vídeo ya se cargó en YouTube! Participación vinculada al Top 23.'
        : '¡Tu vídeo ya se cargó en YouTube! La participación en el Top quedó pendiente.',
      result.rgPublicationLinked === true ? 'success' : 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo publicar en YouTube.';
      setYoutubeProgress(null);
      setPublishError(message);
      onShowToast(message, 'error');
    } finally {
      // Cleanup is independent of publication. A slow cleanup response must
      // not keep a confirmed video behind disabled controls.
      void fetch(`/api/studio/youtube/upload?uploadId=${uploadId}&action=delete`, { method: 'POST', keepalive: true }).catch(() => undefined);
      exportLock.current = false;
      setYoutubeLoading(false);
    }
  };

  const handleRetryRgLink = async () => {
    if (!youtubeResult?.rgLink) return;
    setRgLoading(true);
    try {
      const response = await fetch('/api/rg/publications', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...youtubeResult.rgLink, youtubeExportJobId: youtubeResult.uploadId }) });
      const data = await response.json();
      if (!response.ok || !data.linked) throw new Error(data.error || 'No se pudo vincular el RG Track.');
      setYoutubeResult(previous => previous ? { ...previous, rgPublicationLinked: true, rgPublicationError: undefined, rewards: data.rewards } : previous);
      window.dispatchEvent(new Event('rg-wallet-updated'));
      window.dispatchEvent(new Event('rg-publication-updated'));
      router.refresh();
      onShowToast('Participación consultada. Mostrando los puntos y RG confirmados.', 'info');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo vincular el RG Track.';
      setYoutubeResult(previous => previous ? { ...previous, rgPublicationError: message } : previous);
      onShowToast('La publicación sigue confirmada. El vínculo RG puede reintentarse.', 'info');
    } finally { setRgLoading(false); }
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

  const title = isDemo ? 'Exportar' : view === 'youtube' ? 'YouTube' : view === 'advanced' ? 'Más opciones' : view === 'delivery' ? 'Enviar voces' : 'Exportar';
  const connectionPending = !youtubeStatus || (!rgIdentityReady && !rgError);
  const participationBlocked = Boolean(rgError || (rgArtist && rgArtist.status !== 'active'));
  const buttonClass = 'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45';
  const inputClass = 'mt-1.5 min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-3 py-2.5 text-base text-white outline-none focus:border-amber-400 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-5">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="export-title" tabIndex={-1} className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/15 bg-[#101014] text-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-5 py-4">
          {view !== 'choose' && !isDemo && <button type="button" aria-label="Volver a exportar" disabled={isBusy} onClick={() => setView('choose')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40"><ArrowLeft size={20} /></button>}
          <div className="min-w-0 flex-1">
            <h2 id="export-title" className="text-lg font-bold">{title}</h2>
            <p className="truncate text-xs text-zinc-400">{view === 'youtube' ? 'Canal RGODBEAT' : beat?.title || 'Tu canción'}</p>
          </div>
          <button type="button" aria-label="Cerrar exportación" disabled={isBusy} onClick={handleClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40"><X size={22} /></button>
        </header>

        <div ref={content} className="min-h-0 overflow-y-auto overscroll-contain p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {isDemo ? <div className="space-y-5 py-3 text-center">
            <Lock className="mx-auto text-amber-400" size={32} />
            <h3 className="text-xl font-bold">Tu canción está lista para salir</h3>
            <p className="text-sm leading-relaxed text-zinc-400">Activa tu pase de Studio para publicar en YouTube o descargar tu canción.</p>
            <button type="button" onClick={() => { onClose(); onOpenUnlockModal?.(); }} className={`${buttonClass} bg-amber-400 text-black hover:bg-amber-300`}>Activar Studio <ArrowRight size={18} /></button>
          </div> : view === 'choose' ? <div className="space-y-3">
            <section className="relative isolate overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.12] to-amber-400/[0.03] p-5">
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-contain bg-center bg-no-repeat opacity-[0.08]" style={{ backgroundImage: "url('/images/rgodbeat-studio-logo.png')" }} />
              <div className="mb-5 flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.16em] text-amber-300"><Sparkles size={14} /> RG REWARDS</span>
                <Trophy className="text-amber-400" size={24} />
              </div>
              <h3 className="text-2xl font-bold leading-tight tracking-tight">Lleva tu canción al Top.</h3>
              <div className="my-5 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-amber-200">
                <span className="flex items-center gap-1.5"><Trophy size={15} /> Puntos para el Top 23</span>
                <span className="flex items-center gap-1.5"><Coins size={15} /> Premios en RG</span>
              </div>
              <button type="button" onClick={openYouTube} disabled={!beat || !engine || isBusy} className={`${buttonClass} bg-red-600 text-white hover:bg-red-500`}><Video size={19} /> Publicar en YouTube <ArrowRight className="ml-auto" size={18} /></button>
            </section>
            <button type="button" onClick={() => void handleExportMaster()} disabled={!beat || !engine || isBusy} className={`${buttonClass} justify-start border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]`}>
              {isExportingMaster ? <Loader2 size={19} className="animate-spin" /> : <Download size={19} className="text-zinc-300" />}
              {isExportingMaster ? 'Preparando canción…' : 'Descargar canción'}
            </button>
            <button type="button" onClick={() => setView('advanced')} disabled={isBusy} className={`${buttonClass} min-h-11 text-zinc-400 hover:bg-white/5 hover:text-white`}>Más opciones</button>
          </div> : view === 'youtube' ? youtubeResult ? <div className="space-y-5 py-3 text-center" role="status" aria-live="polite">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><Check size={30} /></div>
            <h3 tabIndex={-1} className="text-xl font-bold outline-none">Tu vídeo está en YouTube</h3>
            <p className="text-sm text-emerald-200">Carga completada y confirmada por YouTube.</p>
            <p className="text-sm text-zinc-400">{youtubeResult.privacy === 'private' ? 'Privado' : youtubeResult.privacy === 'public' ? 'Público' : 'No listado'}</p>
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-relaxed text-amber-100">
              <Trophy size={22} className="mx-auto mb-2 text-amber-300" />
              <p>{youtubeResult.rgPublicationLinked === true ? 'Tu publicación quedó vinculada al Top 23.' : 'Tu vídeo se publicó. Falta vincular tu participación al Top 23.'}</p>
              {youtubeResult.rgPublicationLinked === true && <div className="mt-3 space-y-2">
                <p>{publicationRewardMessages(youtubeResult.rewards).score}</p>
                <p>{publicationRewardMessages(youtubeResult.rewards).credits}</p>
                {youtubeResult.rewards?.balanceRg != null && <p>Saldo: {youtubeResult.rewards.balanceRg.toLocaleString('es')} RG</p>}
              </div>}
              {youtubeResult.rgPublicationError && <p className="mt-2 text-xs text-amber-200">{youtubeResult.rgPublicationError}</p>}
              {youtubeResult.rgLink && (youtubeResult.rgPublicationLinked !== true || youtubeResult.rewards?.score !== 'recorded' || !['credited', 'not_awarded'].includes(youtubeResult.rewards?.credits || '')) && <button type="button" onClick={() => void handleRetryRgLink()} disabled={rgLoading} className={`${buttonClass} mt-3 bg-amber-400 text-black hover:bg-amber-300`}>{rgLoading ? 'Consultando…' : youtubeResult.rgPublicationLinked ? 'Actualizar puntos y RG' : 'Reintentar participación'}</button>}
            </div>
            <Link href="/rg/wallet" prefetch={false} className={`${buttonClass} border border-amber-300/20 text-amber-200`}>Ver mi wallet RG <ArrowRight size={17} /></Link>
            <a href={youtubeResult.videoUrl} target="_blank" rel="noreferrer" className={`${buttonClass} bg-red-600 text-white hover:bg-red-500`}>Ver en YouTube <ExternalLink size={17} /></a>
            <button type="button" onClick={handleClose} disabled={isBusy} className={`${buttonClass} bg-white/5 hover:bg-white/10`}>Volver al Studio</button>
          </div> : <form id="youtube-publish-form" className="space-y-4" onSubmit={event => { event.preventDefault(); void handlePublishToYouTube(); }}>
            <h3 tabIndex={-1} className="sr-only outline-none">Publica y entra al Top</h3>
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-200"><Trophy size={18} className="mt-0.5 shrink-0" /><p>Suma puntos para el Top 23 y compite por premios en RG.</p></div>
            <label className="block text-sm text-zinc-300">Nombre artístico
              <input value={artistName} maxLength={80} required autoComplete="nickname" onChange={event => setArtistName(event.target.value)} disabled={isBusy} placeholder="Tu nombre de artista" className={inputClass} />
            </label>
            <label className="block text-sm text-zinc-300">Título de la canción
              <input value={youtubeTitle} maxLength={100} onChange={event => setYoutubeTitle(event.target.value)} disabled={isBusy} placeholder={beat?.title || 'Tu canción'} className={inputClass} />
            </label>
            <label className="block text-sm text-zinc-300">Visibilidad
              <select aria-label="Visibilidad" value={youtubePrivacy} onChange={event => setYoutubePrivacy(event.target.value as 'unlisted' | 'public')} disabled={isBusy} className={`${inputClass} bg-[#17171c]`}><option value="unlisted">No listado · solo con enlace</option><option value="public">Público · visible para todos</option></select>
            </label>
            <details className="rounded-xl border border-white/10 bg-white/[0.02]">
              <summary className="cursor-pointer px-3 py-3 text-sm text-zinc-400">Portada y más opciones</summary>
              <div className="space-y-4 border-t border-white/[0.07] p-3">
                <p className="text-xs text-zinc-400">{coverImage ? coverImage.name : 'Usaremos la portada del beat o de RGODBEAT.'}</p>
                <label className={`${buttonClass} cursor-pointer border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10`}><ImagePlus size={18} /> Cambiar portada
                  <input aria-label="Cambiar portada" type="file" accept="image/jpeg,image/png,image/webp" disabled={isBusy} className="sr-only" onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 4_000_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                      onShowToast('Elige una imagen JPG, PNG o WebP de menos de 4 MB.', 'error');
                      event.target.value = ''; return;
                    }
                    setCoverImage(file);
                  }} />
                </label>
                {coverImage && <button type="button" disabled={isBusy} onClick={() => setCoverImage(null)} className="min-h-11 text-xs text-zinc-400 underline">Usar portada original</button>}
                <label className="block text-sm text-zinc-300">Descripción del vídeo
                  <textarea aria-label="Descripción del vídeo" value={youtubeDescription} maxLength={5000} rows={5} onChange={event => setYoutubeDescription(event.target.value)} disabled={isBusy} className={`${inputClass} resize-y`} />
                </label>
                <button type="button" disabled={isBusy} onClick={() => { setYoutubeTitle(null); setYoutubeDescription(null); }} className="min-h-11 text-xs text-zinc-400 underline">Restaurar título y descripción automáticos</button>
                {youtubeDescriptionBytes > 5000 && <p role="alert" className="text-xs text-red-300">La descripción es demasiado larga. Acórtala para publicar.</p>}
                {compatibleTracks.length > 0 && <label className="block text-sm text-zinc-300">Canción en el Top
                  <select value={rgTrackId} onChange={event => setRgTrackId(event.target.value)} disabled={isBusy} className={`${inputClass} bg-[#17171c]`}><option value="">Registrar como nueva canción</option>{compatibleTracks.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</select>
                </label>}
              </div>
            </details>
            <fieldset disabled={isBusy} className="text-xs text-zinc-300">
              <legend>¿El vídeo está hecho para niños?</legend>
              <div className="mt-1 flex gap-5">
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="youtubeKids" checked={!madeForKids} onChange={() => setMadeForKids(false)} className="h-4 w-4 accent-amber-400" /> No</label>
                <label className="flex min-h-11 items-center gap-2"><input type="radio" name="youtubeKids" checked={madeForKids} onChange={() => setMadeForKids(true)} className="h-4 w-4 accent-amber-400" /> Sí</label>
              </div>
            </fieldset>
            <label className="flex min-h-11 items-start gap-2.5 text-xs leading-relaxed text-zinc-300"><input type="checkbox" checked={hasRights} onChange={event => setHasRights(event.target.checked)} disabled={isBusy} required className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400" />Tengo los derechos del audio y la imagen para publicar en YouTube.</label>
          </form> : view === 'advanced' ? <div className="space-y-3">
            <h3 tabIndex={-1} className="mb-4 text-sm text-zinc-400 outline-none">Descarga tus pistas o envíalas a mezclar.</h3>
            <button type="button" onClick={() => void handleExportAllRawStems()} disabled={!beat || !hasRecordings || isBusy} className={`${buttonClass} justify-start border border-white/10 bg-white/5 hover:bg-white/10`}><Mic size={18} className="text-blue-300" />{isExportingRawStems ? 'Preparando voces…' : 'Voces sin efectos'}</button>
            <button type="button" onClick={() => void handleExportAllWetStems()} disabled={!beat || !hasRecordings || isBusy} className={`${buttonClass} justify-start border border-white/10 bg-white/5 hover:bg-white/10`}><Sliders size={18} className="text-purple-300" />{isExportingWetStems ? 'Preparando voces…' : 'Voces con efectos'}</button>
            <button type="button" onClick={() => void handleExportBeatStem()} disabled={!beat || isBusy} className={`${buttonClass} justify-start border border-white/10 bg-white/5 hover:bg-white/10`}><Music size={18} className="text-amber-300" />{isExportingBeatStem ? 'Preparando instrumental…' : 'Solo instrumental'}</button>
            {hasRecordings ? <>
              <details className="rounded-xl border border-white/10 text-sm">
                <summary className="cursor-pointer p-3 text-zinc-400">Elegir una pista de voz</summary>
                <div className="space-y-1 px-3 pb-3">{recordedTracks.map(track => <button key={track.id} type="button" disabled={isBusy} onClick={() => void handleExportSingleRawStem(track)} className={`${buttonClass} justify-between bg-white/5 text-left hover:bg-white/10`}><span className="min-w-0 truncate">{track.name}</span>{downloadingStemId === `raw-${track.id}` ? <Loader2 size={17} className="shrink-0 animate-spin" /> : <Download size={17} className="shrink-0 text-zinc-400" />}</button>)}</div>
              </details>
              <button type="button" disabled={isBusy} onClick={() => setView('delivery')} className={`${buttonClass} justify-start border border-amber-400/20 bg-amber-400/5 text-amber-200 hover:bg-amber-400/10`}><Send size={18} /> Enviar voces a RGODBEAT <ArrowRight size={17} className="ml-auto" /></button>
            </> : <p className="py-2 text-xs text-zinc-500">Graba voces para descargar o enviar tus pistas.</p>}
          </div> : beat && hasRecordings ? <div><h3 tabIndex={-1} className="sr-only outline-none">Enviar voces a RGODBEAT</h3><StemDeliveryForm key={beat.id} engine={engine} beat={beat} tracks={tracks} disabled={isBusy} onBusyChange={setIsSendingStems} /></div> : null}
        </div>
        {!isDemo && view === 'youtube' && !youtubeResult && <footer className="shrink-0 space-y-3 border-t border-white/[0.07] bg-[#101014] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {youtubeLoading && youtubeProgress && <div role="status" aria-live="polite" className="space-y-2 rounded-xl bg-white/5 p-3">
              <p className="flex items-center justify-between gap-2 text-xs text-zinc-300"><span>{youtubeProgress.label}</span>{youtubeUploadPercent !== null && <span>{youtubeUploadPercent}%</span>}</p>
              <div role="progressbar" aria-label={youtubeProgress.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={youtubeUploadPercent ?? undefined} aria-valuetext={youtubeProgress.label} className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full bg-amber-400 ${youtubeUploadPercent === null ? 'animate-pulse' : ''}`} style={{ width: youtubeUploadPercent === null ? '35%' : `${youtubeUploadPercent}%` }} /></div>
            </div>}
            {!youtubeLoading && (youtubeStatus && !youtubeStatus.available || participationBlocked) && <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100" role="alert">
              <p>{rgError || (rgArtist && rgArtist.status !== 'active' ? 'Tu perfil de artista no está activo para participar.' : youtubeStatus?.code && youtubeStatus.error || 'YouTube no está disponible ahora. Puedes descargar tu canción y volver a intentarlo.')}</p>
              {youtubeStatus?.canReconnect && ['channelAuthorization', 'insufficientPermissions', 'channelMismatch'].includes(youtubeStatus.code || '') && <a href="/admin/youtube" target="_blank" rel="noreferrer" className="mt-2 flex min-h-11 items-center gap-2 font-semibold underline">Volver a autorizar canal <ExternalLink size={14} /></a>}
              <button type="button" disabled={isBusy} onClick={retryConnection} className="mt-1 min-h-11 font-semibold underline">Volver a comprobar</button>
            </div>}
            {publishError && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-200">{publishError}</p>}
            <button type="submit" form="youtube-publish-form" disabled={isBusy || !youtubeStatus?.available || !rgIdentityReady || participationBlocked || !artistName.trim() || !hasRights || youtubeDescriptionBytes > 5000} className={`${buttonClass} bg-red-600 text-white hover:bg-red-500`}>
              {youtubeLoading || connectionPending ? <Loader2 size={18} className="animate-spin" /> : <Video size={18} />}
              {youtubeLoading ? 'Publicando…' : connectionPending ? 'Comprobando conexión…' : 'Publicar y participar'}
            </button>
        </footer>}
      </div>
    </div>
  );
};

// A fresh dialog on each open keeps the first screen short and drops stale
// publication results/form state when the user switches projects or closes it.
export function ExportModal(props: ExportModalProps) {
  return props.isOpen ? <ExportDialog key={props.beat?.id || 'empty'} {...props} /> : null;
}
