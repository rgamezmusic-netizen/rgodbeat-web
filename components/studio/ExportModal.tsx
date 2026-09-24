import React, { useState } from 'react';
import { X, Download, Mic, Sliders, Music, Sparkles, Check, Activity, Lock } from 'lucide-react';
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
  const [sidechainEnabled, setSidechainEnabled] = useState<boolean>(true);
  const [downloadingStemId, setDownloadingStemId] = useState<string | null>(null);

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
              Has grabado tu maqueta en el estudio. Para exportar y descargar el Master WAV 24-bit / 48kHz sin compresión y los stems vocales separados, activa tu Pase de 30 Días por $10 USD o compra cualquier beat en la tienda (incluye 30 días gratis).
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
            <a
              href="/beats"
              className="flex-1 py-3 px-4 rounded-xl bg-white/[0.08] hover:bg-purple-600 hover:text-white border border-white/10 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all text-center flex items-center justify-center active:scale-95"
            >
              Comprar Beat (+30d)
            </a>
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
  const cleanBeatTitle = beat ? beat.title.replace(/[^a-zA-Z0-9]/g, '_') : 'Project';

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 1. Export Master Mix (24-bit / 48.0 kHz PCM WAV with bass-preserving crossover sidechain)
  const handleExportMaster = async () => {
    if (!engine || !beat) {
      onShowToast('Carga un beat antes de exportar.', 'error');
      return;
    }

    try {
      setIsExportingMaster(true);
      onShowToast(
        sidechainEnabled
          ? 'Renderizando Master WAV 24-bit / 48kHz con Sidechain profesional...'
          : 'Renderizando Master WAV 24-bit / 48kHz...',
        'info'
      );

      const blob = await engine.exportMix(tracks, {
        enableSidechain: sidechainEnabled,
      });

      const filename = `RGODBEAT_${cleanBeatTitle}_MASTER_24bit_48k${sidechainEnabled ? '_Sidechain' : ''}.wav`;
      triggerDownload(blob, filename);

      onShowToast(`¡Master descargado: ${filename}!`, 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Error al procesar el master mezclado.', 'error');
    } finally {
      setIsExportingMaster(false);
    }
  };

  // 2. Export All Raw Vocal Stems (Dry, Aligned from 00:00:00 at 24-bit / 48kHz)
  const handleExportAllRawStems = async () => {
    if (!engine || !beat) return;
    if (!hasRecordings) {
      onShowToast('No hay grabaciones de voz para exportar como stems.', 'error');
      return;
    }

    try {
      setIsExportingRawStems(true);
      onShowToast('Procesando stems de voces RAW (24-bit / 48kHz sin efectos, alineadas)...', 'info');

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
      setIsExportingRawStems(false);
    }
  };

  // 3. Export Single Raw Vocal Stem
  const handleExportSingleRawStem = async (track: VocalTrack) => {
    if (!engine || !beat) return;
    try {
      setDownloadingStemId(`raw-${track.id}`);
      const stems = await engine.exportVocalRawStems([track]);
      if (stems.length > 0) {
        triggerDownload(stems[0].blob, stems[0].filename);
        onShowToast(`¡Stem RAW de ${track.name} exportado (24-bit/48k)!`, 'success');
      }
    } catch (err) {
      console.error(err);
      onShowToast(`Error al exportar stem de ${track.name}`, 'error');
    } finally {
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

    try {
      setIsExportingWetStems(true);
      onShowToast('Renderizando stems procesados (24-bit / 48kHz Wet)...', 'info');

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
      setIsExportingWetStems(false);
    }
  };

  // 5. Export Isolated Beat Stem
  const handleExportBeatStem = async () => {
    if (!engine || !beat) return;
    try {
      setIsExportingBeatStem(true);
      onShowToast('Exportando pista del beat (24-bit / 48kHz)...', 'info');
      const stem = await engine.exportBeatStem();
      triggerDownload(stem.blob, stem.filename);
      onShowToast('¡Pista del Beat descargada!', 'success');
    } catch (err) {
      console.error(err);
      onShowToast('Error al exportar beat.', 'error');
    } finally {
      setIsExportingBeatStem(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
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
        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* OPTION 1: Master Mezclado WAV con Sidechain Profesional */}
          <div className="p-4 rounded-xl bg-gradient-to-b from-amber-500/10 via-zinc-900/60 to-zinc-900/90 border border-amber-500/30 shadow-lg space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Recomendado
                  </span>
                  {sidechainEnabled && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Sidechain Activo
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  Master Mezclado Completo (WAV)
                </h3>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  Integración acústica profesional entre voces y beat. Cuando el sidechain está activo, abre espacio en las frecuencias medias para que la voz principal resalte con claridad absoluta, manteniendo los graves, bombo y 808 100% intactos con toda su pegada y potencia.
                </p>
              </div>
            </div>

            {/* Sidechain Toggle Button */}
            <div className="p-3 rounded-lg bg-black/40 border border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 ${sidechainEnabled ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <span className="text-xs text-zinc-300 font-medium">
                  {sidechainEnabled
                    ? 'Sidechain activo: graves y 808 intactos, medios ducking para voz'
                    : 'Sidechain desactivado: el instrumental suena plano sin atenuación'}
                </span>
              </div>

              {/* Dedicated Green Sidechain Toggle Button */}
              <button
                type="button"
                onClick={() => setSidechainEnabled(!sidechainEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-95 shadow-sm select-none ${
                  sidechainEnabled
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400 shadow-emerald-500/25'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700'
                }`}
                title="Activar o desactivar el sidechain profesional"
              >
                {sidechainEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                <span>Sidechain {sidechainEnabled ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            <button
              onClick={handleExportMaster}
              disabled={isExportingMaster}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-display shadow-lg shadow-amber-500/20 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isExportingMaster ? 'Renderizando Master Mezclado (24-bit / 48kHz)...' : 'Descargar Master Mezclado (WAV)'}</span>
            </button>
          </div>

          {/* OPTION 2: Voces RAW como Stems (Dry / Sin Efectos) */}
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                  <Mic className="w-3.5 h-3.5" /> Pistas Limpias para Mezcla Externa
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Stems de Voces RAW (Dry / Sin Efectos)
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Exporta cada pista de voz por separado en formato crudo 24-bit / 48.0 kHz (sin Auto-Tune, sin reverb, sin compresión).
                  Todas las tomas inician exactamente en el segundo cero (00:00:00) para arrastrar directo a Pro Tools, FL Studio, Ableton o enviar a tu ingeniero de mezcla.
                </p>
              </div>
            </div>

            {hasRecordings ? (
              <div className="space-y-2 pt-1">
                {/* Batch Button */}
                <button
                  onClick={handleExportAllRawStems}
                  disabled={isExportingRawStems}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {isExportingRawStems
                      ? 'Exportando todos los stems RAW (24-bit / 48kHz)...'
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
                        disabled={downloadingStemId === `raw-${tr.id}`}
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
                  Stems Procesados (Wet FX)
                </h4>
                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                  Pistas vocales individuales con Auto-Tune, EQ, compresión, delay y reverb aplicados en 24-bit / 48kHz.
                </p>
              </div>
              <button
                onClick={handleExportAllWetStems}
                disabled={!hasRecordings || isExportingWetStems}
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
                  Pista de Beat Aislada
                </h4>
                <p className="text-[11px] text-zinc-400 mt-1 leading-snug">
                  Archivo WAV del instrumental con sus filtros de Beat FX aplicados en 24-bit / 48kHz.
                </p>
              </div>
              <button
                onClick={handleExportBeatStem}
                disabled={isExportingBeatStem}
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
            Formato: <strong className="text-zinc-200">PCM WAV 24-bit / 48.0 kHz Estéreo</strong>
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
