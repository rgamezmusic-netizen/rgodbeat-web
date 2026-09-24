import React, { useRef, useState, useEffect } from 'react';
import {
  X,
  Upload,
  Music,
  Disc,
  Sparkles,
  Check,
  Trash2,
  ShieldCheck,
  Database,
  Play,
  Square,
  HardDrive,
  AlertCircle,
  Heart,
  Flame,
  Loader2,
} from 'lucide-react';
import { BeatAnalysisResult, BeatData } from '@/lib/studio/types/audio';
import { extractWaveformPeaks } from '@/lib/studio/audio/wavEncoder';
import { analyzeBeatAudio, parseKeyAndGetRelative } from '@/lib/studio/audio/beatAnalyzer';
import { MAX_SAVED_BEATS } from '@/lib/studio/audio/beatStorage';

interface LoadBeatModalProps {
  currentBeat: BeatData | null;
  demoBeats: BeatData[];
  savedCustomBeats: BeatData[];
  onSelectBeat: (beat: BeatData) => void;
  onUploadBeat: (beat: BeatData, detectedAnalysis?: BeatAnalysisResult, rawBuffer?: ArrayBuffer) => void;
  onDeleteSavedBeat?: (beatId: string) => void;
  onClose: () => void;
  audioCtx: AudioContext | null;
}

export const LoadBeatModal: React.FC<LoadBeatModalProps> = ({
  currentBeat,
  demoBeats,
  savedCustomBeats,
  onSelectBeat,
  onUploadBeat,
  onDeleteSavedBeat,
  onClose,
  audioCtx,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'ranking' | 'upload' | 'slots' | 'presets'>('ranking');
  const [rankingBeats, setRankingBeats] = useState<any[]>([]);
  const [isLoadingRanking, setIsLoadingRanking] = useState(false);
  const [votedBeatIds, setVotedBeatIds] = useState<Record<string, boolean>>({});
  const [votingBeatId, setVotingBeatId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customBpm, setCustomBpm] = useState(130);
  const [customKey, setCustomKey] = useState('A minor');
  const [isDragging, setIsDragging] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<BeatAnalysisResult | null>(null);

  // In-modal audio preview player
  const [previewingBeatId, setPreviewingBeatId] = useState<string | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Load Top 23 Ranking Beats from server
  useEffect(() => {
    async function fetchRankingBeats() {
      try {
        setIsLoadingRanking(true);
        const res = await fetch('/api/beats/ranking');
        if (res.ok) {
          const data = await res.json();
          setRankingBeats(data.beats || []);
        }
      } catch (err) {
        console.error('Error fetching ranking beats:', err);
      } finally {
        setIsLoadingRanking(false);
      }
    }
    fetchRankingBeats();
  }, []);

  const handleVoteBeat = async (beatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setVotingBeatId(beatId);
      const res = await fetch(`/api/beats/${beatId}/vote`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setVotedBeatIds((prev) => ({ ...prev, [beatId]: true }));
        setRankingBeats((prev) =>
          prev.map((b) => (b.id === beatId ? { ...b, favorites: data.favorites } : b))
        );
        setStatusMsg(data.message || "¡Voto registrado en el ranking de esta semana!");
      } else if (data.requireLogin) {
        window.location.href = `/login?redirect=/studio`;
      } else {
        setStatusMsg(data.message || data.error);
      }
    } catch (err: any) {
      console.error(err);
      setStatusMsg("Error al emitir el voto.");
    } finally {
      setVotingBeatId(null);
    }
  };

  const handleLoadRankingBeat = async (beat: any) => {
    if (!audioCtx) {
      setStatusMsg("El motor de audio no está listo.");
      return;
    }
    if (!beat.previewUrl) {
      setStatusMsg("Este beat no tiene audio disponible.");
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMsg(`Descargando y preparando audio de "${beat.title}"...`);
      const res = await fetch(beat.previewUrl);
      const arrayBuffer = await res.arrayBuffer();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const waveform = extractWaveformPeaks(decodedBuffer, 64);

      const newBeat: BeatData = {
        id: `catalog-${beat.id}`,
        title: beat.title,
        producer: 'RGODBEAT',
        bpm: beat.bpm || 140,
        key: beat.key || 'C minor',
        scale: beat.key?.includes('m') ? 'Menor' : 'Mayor',
        duration: decodedBuffer.duration,
        buffer: decodedBuffer,
        artworkGradient: 'linear-gradient(135deg, #1d102e 0%, #121018 50%, #09080d 100%)',
        waveformSample: waveform,
      };

      stopPreview();
      onSelectBeat(newBeat);
      onClose();
    } catch (err: any) {
      console.error(err);
      setStatusMsg("Error al cargar el beat del catálogo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const stopPreview = () => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {
        // already stopped
      }
      previewSourceRef.current = null;
    }
    setPreviewingBeatId(null);
  };

  const handleTogglePreview = (beat: BeatData, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!audioCtx || !beat.buffer) return;

    if (previewingBeatId === beat.id) {
      stopPreview();
      return;
    }

    stopPreview();

    try {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const source = audioCtx.createBufferSource();
      source.buffer = beat.buffer;

      const gain = audioCtx.createGain();
      gain.gain.value = 0.85;

      source.connect(gain);
      gain.connect(audioCtx.destination);

      source.onended = () => {
        if (previewSourceRef.current === source) {
          previewSourceRef.current = null;
          setPreviewingBeatId(null);
        }
      };

      source.start(0);
      previewSourceRef.current = source;
      setPreviewingBeatId(beat.id);
    } catch (err) {
      console.error('Preview error:', err);
      stopPreview();
    }
  };

  const keys = [
    'C major', 'C minor',
    'C# major', 'C# minor',
    'D major', 'D minor',
    'D# major', 'D# minor',
    'E major', 'E minor',
    'F major', 'F minor',
    'F# major', 'F# minor',
    'G major', 'G minor',
    'G# major', 'G# minor',
    'A major', 'A minor',
    'A# major', 'A# minor',
    'B major', 'B minor',
  ];

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const isStorageFull = savedCustomBeats.length >= MAX_SAVED_BEATS;

  const handleFile = async (file: File) => {
    if (isStorageFull) {
      setStatusMsg(`Capacidad máxima de ${MAX_SAVED_BEATS} beats alcanzada. Elimina uno antes de agregar.`);
      return;
    }

    if (!audioCtx) {
      setStatusMsg('Audio engine initializing...');
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMsg(`Decodificando archivo de audio "${file.name}"...`);

      const arrayBuffer = await file.arrayBuffer();
      // Keep a clone for IndexedDB persistence before decodeAudioData detaches it
      const arrayBufferForStorage = arrayBuffer.slice(0);
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      setStatusMsg('Analizando BPM y escala musical del beat con IA/DSP...');

      // Run real beat analyzer (BPM and Key Detection)
      let analysisResult: BeatAnalysisResult | null = null;
      try {
        analysisResult = await analyzeBeatAudio(decodedBuffer);
        setLastAnalysis(analysisResult);
        setCustomBpm(analysisResult.bpm);
        setCustomKey(`${analysisResult.rootKey} ${analysisResult.scaleMode}`);
      } catch (analErr) {
        console.warn('Auto analysis warning:', analErr);
      }

      const waveform = extractWaveformPeaks(decodedBuffer, 64);
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      const detectedKeyStr = analysisResult
        ? `${analysisResult.rootKey}${analysisResult.scaleMode === 'minor' ? 'm' : ''}`
        : customKey;
      const detectedBpmVal = analysisResult ? analysisResult.bpm : customBpm;

      const newBeat: BeatData = {
        id: `upload-${Date.now()}`,
        title: cleanTitle,
        producer: 'Mi Beat (Físico)',
        bpm: detectedBpmVal,
        key: detectedKeyStr,
        scale: analysisResult ? (analysisResult.scaleMode === 'minor' ? 'Menor Natural' : 'Mayor') : 'Menor',
        duration: decodedBuffer.duration,
        buffer: decodedBuffer,
        artworkGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
        waveformSample: waveform,
        isCustomUpload: true,
        detectedBpm: detectedBpmVal,
        detectedKey: detectedKeyStr,
        detectedConfidence: analysisResult?.confidence,
        relativeKey: analysisResult?.relativeKey,
        relativeTonalityName: analysisResult?.relativeTonalityName,
        isLocked: true,
      };

      onUploadBeat(newBeat, analysisResult || undefined, arrayBufferForStorage);

      setStatusMsg(
        analysisResult
          ? `¡Cargado en Slot #${savedCustomBeats.length + 1}! (${analysisResult.bpm} BPM • ${analysisResult.tonalityName} • Relativa: ${analysisResult.relativeTonalityName})`
          : `¡Cargado en Slot #${savedCustomBeats.length + 1}!`
      );

      setTimeout(() => {
        setIsProcessing(false);
        setActiveTab('slots');
      }, 700);
    } catch (err) {
      console.error('File load error:', err);
      setStatusMsg('No se pudo decodificar el archivo. Asegúrate de que sea WAV, MP3, M4A o FLAC.');
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Analyze an existing preset beat
  const handleAnalyzePreset = async (beat: BeatData, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);
    setStatusMsg(`Analizando ${beat.title}...`);
    try {
      const res = await analyzeBeatAudio(beat.buffer);
      setLastAnalysis(res);
      beat.detectedBpm = res.bpm;
      beat.detectedKey = res.key;
      beat.detectedConfidence = res.confidence;
      beat.relativeKey = res.relativeKey;
      beat.relativeTonalityName = res.relativeTonalityName;
      setStatusMsg(`Detectado: ${res.bpm} BPM • ${res.tonalityName} · Relativa: ${res.relativeTonalityName} (${res.confidence}% confianza)`);
      setIsProcessing(false);
    } catch {
      setIsProcessing(false);
      setStatusMsg('Error analizando audio');
    }
  };

  // Generate 23 slots
  const slots = Array.from({ length: MAX_SAVED_BEATS }, (_, index) => {
    const beat = savedCustomBeats[index] || null;
    return {
      slotNumber: index + 1,
      beat,
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#101014] border border-zinc-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl text-white overflow-hidden">
        {/* Header with Slot Badge */}
        <div className="p-4 sm:p-5 pb-3 border-b border-zinc-800 bg-[#14141a]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold font-display uppercase tracking-wide flex items-center gap-2">
                  <span>ESPACIO FÍSICO DE BEATS</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    23 SLOTS
                  </span>
                </h3>
                <p className="text-[11px] font-mono text-zinc-400">
                  Infraestructura permanente en tu dispositivo • {savedCustomBeats.length} / {MAX_SAVED_BEATS} ocupados
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                stopPreview();
                onClose();
              }}
              className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 23 Slots Capacity Progress Meter */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
              <span className="text-zinc-400 flex items-center gap-1">
                <Database className="w-3 h-3 text-amber-400" />
                <span>Capacidad Fija: 23 Slots Físicos</span>
              </span>
              <span className={`font-bold ${isStorageFull ? 'text-rose-400' : 'text-amber-400'}`}>
                {savedCustomBeats.length} de {MAX_SAVED_BEATS} guardados
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden flex">
              <div
                className={`h-full transition-all duration-300 ${
                  isStorageFull ? 'bg-rose-500' : 'bg-gradient-to-r from-amber-500 to-amber-300'
                }`}
                style={{ width: `${(savedCustomBeats.length / MAX_SAVED_BEATS) * 100}%` }}
              />
            </div>
          </div>

                    {/* Navigation Tabs */}
          <div className="grid grid-cols-4 gap-1.5 mt-3 pt-2 border-t border-zinc-800/80">
            <button
              onClick={() => setActiveTab('ranking')}
              className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'ranking'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="truncate">Top 23</span>
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'upload'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Subir Beat</span>
            </button>
            <button
              onClick={() => setActiveTab('slots')}
              className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'slots'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Slots ({savedCustomBeats.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('presets')}
              className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === 'presets'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
              }`}
            >
              <Disc className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Demo</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 0: TOP 23 CATALOG & WEEKLY VOTES */}
          {activeTab === 'ranking' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                    TOP 23 RANKING SEMANAL EN VIVO
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    Reproduce, vota por tus favoritos (1 voto semanal) o carga el beat al estudio.
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0">
                  {rankingBeats.length} Beats Activos
                </span>
              </div>

              {isLoadingRanking ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400 font-mono text-xs">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  <span>Sincronizando beats del ranking...</span>
                </div>
              ) : rankingBeats.length === 0 ? (
                <div className="py-10 text-center text-zinc-500 font-mono text-xs">
                  No hay beats disponibles en el ranking en este momento.
                </div>
              ) : (
                <div className="space-y-2">
                  {rankingBeats.map((beat) => {
                    const isSelected = currentBeat?.id === `catalog-${beat.id}`;
                    const hasVoted = Boolean(votedBeatIds[beat.id]);
                    const isVoting = votingBeatId === beat.id;

                    return (
                      <div
                        key={beat.id}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/50 shadow-sm ring-1 ring-amber-500/30'
                            : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Rank badge */}
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                              beat.currentRank === 1
                                ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                                : beat.currentRank === 2
                                ? 'bg-gradient-to-br from-zinc-300 to-zinc-500 text-black'
                                : beat.currentRank === 3
                                ? 'bg-gradient-to-br from-amber-700 to-amber-900 text-amber-200'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            #{beat.currentRank || '-'}
                          </div>

                          {/* Cover artwork */}
                          {beat.coverUrl ? (
                            <img
                              src={beat.coverUrl}
                              alt={beat.title}
                              className="w-10 h-10 rounded-lg object-cover border border-zinc-700/60 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                              <Music className="w-4 h-4 text-zinc-400" />
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-100 font-display truncate">
                              {beat.title}
                            </p>
                            <p className="text-xs text-zinc-400 font-mono-numbers flex items-center gap-1.5 flex-wrap">
                              <span className="text-amber-300 font-semibold">{beat.bpm} BPM</span>
                              <span>·</span>
                              <span>{beat.key}</span>
                              <span>·</span>
                              <span className="text-zinc-500">{beat.genre}</span>
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Vote Weekly Button */}
                          <button
                            onClick={(e) => handleVoteBeat(beat.id, e)}
                            disabled={isVoting || hasVoted}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all ${
                              hasVoted
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : 'bg-zinc-800/80 hover:bg-rose-500/10 text-zinc-300 hover:text-rose-400 border-zinc-700 hover:border-rose-500/30 active:scale-95'
                            }`}
                            title={hasVoted ? "Votaste por este beat esta semana" : "Votar por este beat en el ranking"}
                          >
                            <Heart
                              className={`w-3.5 h-3.5 ${
                                hasVoted ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'
                              }`}
                            />
                            <span>{beat.favorites || 0}</span>
                          </button>

                          {/* Use Beat / Load to Timeline Button */}
                          {isSelected ? (
                            <div className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center shrink-0">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                          ) : (
                            <button
                              onClick={() => handleLoadRankingBeat(beat)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs transition-all active:scale-95 shadow-sm"
                            >
                              Grabar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 1: 23 SLOTS RACK VIEW */}
          {activeTab === 'slots' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-zinc-300 uppercase tracking-wider">
                  RACK FÍSICO (23 SLOTS INDIVIDUALES)
                </span>
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Almacenamiento Local Seguro
                </span>
              </div>

              {/* Status Banner when full */}
              {isStorageFull && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Has completado los 23 slots. Elimina un beat si deseas liberar un slot.</span>
                </div>
              )}

              {/* Slots List */}
              <div className="space-y-2">
                {slots.map(({ slotNumber, beat }) => {
                  const isSelected = currentBeat?.id === beat?.id;
                  const isPreviewing = previewingBeatId === beat?.id;

                  if (beat) {
                    const keyInfo = parseKeyAndGetRelative(beat.key, beat.scale);
                    return (
                      <div
                        key={beat.id}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500/80 shadow-md ring-1 ring-amber-500/30'
                            : 'bg-zinc-900/80 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {/* Slot Number + Beat Details */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="text-[10px] font-mono font-black px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-amber-400 shrink-0">
                            #{slotNumber.toString().padStart(2, '0')}
                          </span>

                          {/* Mini artwork */}
                          <div
                            className="w-9 h-9 rounded-lg border border-zinc-700 shadow flex items-center justify-center shrink-0 overflow-hidden relative"
                            style={{ background: beat.artworkGradient }}
                          >
                            <Music className="w-4 h-4 text-amber-300" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-semibold text-zinc-100 font-display truncate">
                              {beat.title}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-zinc-400 font-mono mt-0.5">
                              <span className="text-amber-300 font-semibold">{beat.bpm} BPM</span>
                              <span>•</span>
                              <span>{keyInfo.keySymbol}</span>
                              <span className="text-zinc-500 font-mono">⇄</span>
                              <span className="text-amber-300/80 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20">
                                Rel. {keyInfo.relativeKey}
                              </span>
                              <span>•</span>
                              <span>{formatDuration(beat.duration)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions: Preview, Select, Delete */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                          {/* Audio Preview Button */}
                          <button
                            onClick={(e) => handleTogglePreview(beat, e)}
                            className={`p-1.5 rounded-lg border text-xs font-mono transition-all ${
                              isPreviewing
                                ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                            }`}
                            title={isPreviewing ? 'Detener prueba' : 'Escuchar beat'}
                          >
                            {isPreviewing ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                          </button>

                          {/* Use / Active Badge */}
                          {isSelected ? (
                            <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-400/15 px-2.5 py-1 rounded-lg border border-amber-400/40 shadow-sm">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>EN USO</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                stopPreview();
                                onSelectBeat(beat);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-200 text-xs font-mono font-semibold transition-all border border-zinc-700 active:scale-95"
                            >
                              Cargar
                            </button>
                          )}

                          {/* Delete from slot */}
                          {onDeleteSavedBeat && (
                            <button
                              onClick={() => {
                                if (previewingBeatId === beat.id) stopPreview();
                                onDeleteSavedBeat(beat.id);
                              }}
                              className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700"
                              title={`Eliminar beat y liberar el Slot #${slotNumber}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Empty Slot
                  return (
                    <div
                      key={`empty-slot-${slotNumber}`}
                      onClick={() => {
                        setActiveTab('upload');
                      }}
                      className="w-full flex items-center justify-between p-2 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/60 hover:border-zinc-700 cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] font-mono font-bold px-2 py-1 rounded bg-zinc-900 text-zinc-500 group-hover:text-amber-400 border border-zinc-800/80">
                          #{slotNumber.toString().padStart(2, '0')}
                        </span>
                        <span className="text-xs font-mono text-zinc-500 group-hover:text-zinc-300">
                          Slot Disponible (Vacío)
                        </span>
                      </div>
                      <button className="text-[11px] font-mono text-amber-400/80 group-hover:text-amber-300 font-semibold px-2 py-0.5 rounded hover:bg-amber-500/10">
                        + Asignar Beat
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD BEAT */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              {/* UPLOAD ANY WAV / AUDIO FILE */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isStorageFull) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => {
                  if (!isStorageFull) fileInputRef.current?.click();
                }}
                className={`cursor-pointer rounded-2xl p-6 text-center border-2 border-dashed transition-all relative overflow-hidden ${
                  isStorageFull
                    ? 'border-zinc-800 bg-zinc-950/60 opacity-60 cursor-not-allowed'
                    : isDragging
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-zinc-700 bg-zinc-900/60 hover:border-amber-500/60 hover:bg-zinc-900/90'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  disabled={isStorageFull}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                  accept="audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-full bg-zinc-800/90 border border-zinc-700 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <Upload className="w-6 h-6 text-amber-400" />
                </div>
                <p className="text-sm font-semibold font-display text-zinc-100">
                  {isProcessing
                    ? 'Procesando y guardando beat...'
                    : isStorageFull
                    ? 'Capacidad máxima de 23 beats alcanzada'
                    : `Subir Beat a Slot #${savedCustomBeats.length + 1} de 23`}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  {isStorageFull
                    ? 'Debes eliminar una pista en la pestaña "Mis 23 Slots" para liberar un slot.'
                    : 'Compatible con WAV, MP3, FLAC, M4A • Se guarda de forma permanente en tu dispositivo'}
                </p>

                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                  <Database className="w-3 h-3 text-emerald-400" />
                  <span>Persistencia IndexedDB + Detección de Tonalidad, Relativa y BPM</span>
                </div>

                {statusMsg && (
                  <p className="text-xs font-mono text-amber-300 mt-2 font-medium bg-amber-950/40 p-2 rounded-lg border border-amber-500/30">
                    {statusMsg}
                  </p>
                )}
              </div>

              {/* DETECTED RESULTS SUMMARY BADGE */}
              {lastAnalysis && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-zinc-900 to-zinc-900 border border-amber-500/40 shadow-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-amber-400 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      DETECCIÓN AUTOMÁTICA DEL BEAT
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">
                      {lastAnalysis.confidence}% Confianza
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <span className="text-[9px] text-zinc-500 block">TEMPO ESTIMADO</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-sm font-bold text-amber-300">{lastAnalysis.bpm} BPM</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (lastAnalysis.bpm >= 115) {
                                const halved = Math.max(40, Math.round(lastAnalysis.bpm / 2));
                                setLastAnalysis({ ...lastAnalysis, bpm: halved });
                                setCustomBpm(halved);
                              }
                            }}
                            className={`px-2 py-0.5 text-[10px] rounded font-mono font-bold transition-all ${
                              lastAnalysis.bpm < 115
                                ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                            }`}
                            title="Modo 1x tiempo base"
                          >
                            1x
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (lastAnalysis.bpm < 115) {
                                const doubled = Math.min(300, Math.round(lastAnalysis.bpm * 2));
                                setLastAnalysis({ ...lastAnalysis, bpm: doubled });
                                setCustomBpm(doubled);
                              }
                            }}
                            className={`px-2 py-0.5 text-[10px] rounded font-mono font-bold transition-all ${
                              lastAnalysis.bpm >= 115
                                ? 'bg-amber-500 text-black font-extrabold shadow-sm'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400'
                            }`}
                            title="Modo x2 tiempo doble"
                          >
                            x2
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800">
                      <span className="text-[9px] text-zinc-500 block">TONALIDAD Y RELATIVA</span>
                      <span className="text-xs font-bold text-amber-300 block truncate">
                        {lastAnalysis.tonalityName}
                      </span>
                      {lastAnalysis.relativeTonalityName && (
                        <span className="text-[10px] text-amber-200/80 block mt-0.5 truncate">
                          Relativa: <strong>{lastAnalysis.relativeTonalityName}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* BPM & KEY MANUAL OVERRIDE (OPTIONAL) */}
              <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                <p className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-300">
                  METADATOS DEL BEAT (OPCIONAL)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-mono text-zinc-400">
                        BPM (TEMPO)
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCustomBpm((p) => Math.max(40, Math.round(p / 2)))}
                          className="px-1 py-0.2 rounded bg-zinc-800 hover:bg-zinc-700 text-[9px] font-mono text-zinc-300"
                        >
                          /2
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomBpm((p) => Math.min(300, Math.round(p * 2)))}
                          className="px-1 py-0.2 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[9px] font-mono text-amber-300 border border-amber-500/40"
                        >
                          x2
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="40"
                      max="300"
                      value={customBpm}
                      onChange={(e) => setCustomBpm(parseInt(e.target.value) || 120)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                      TONALIDAD / KEY
                    </label>
                    <select
                      value={customKey}
                      onChange={(e) => setCustomKey(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-mono text-white focus:outline-none focus:border-amber-400"
                    >
                      {keys.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FACTORY PRESETS */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-zinc-400">
                  BEATS PREINSTALADOS DEL ESTUDIO
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Sin conexión</span>
              </div>

              <div className="space-y-2">
                {demoBeats.map((beat) => {
                  const isSelected = currentBeat?.id === beat.id;
                  const isPreviewing = previewingBeatId === beat.id;
                  const keyInfo = parseKeyAndGetRelative(beat.key, beat.scale);

                  return (
                    <div
                      key={beat.id}
                      onClick={() => {
                        stopPreview();
                        onSelectBeat(beat);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500/50 shadow-sm ring-1 ring-amber-500/30'
                          : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-lg border border-zinc-700/60 shadow flex items-center justify-center shrink-0"
                          style={{ background: beat.artworkGradient }}
                        >
                          <Disc className="w-5 h-5 text-white/80" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-100 font-display truncate">
                            {beat.title}
                          </p>
                          <p className="text-xs text-zinc-400 font-mono-numbers flex items-center gap-1.5 flex-wrap">
                            <span className="text-amber-300 font-semibold">{beat.bpm} BPM</span>
                            <span>·</span>
                            <span>{keyInfo.keySymbol}</span>
                            <span className="text-zinc-500">⇄</span>
                            <span className="text-amber-300/80 bg-amber-500/10 px-1 rounded text-[10px]">
                              Rel. {keyInfo.relativeKey}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleTogglePreview(beat, e)}
                          className={`p-1.5 rounded-lg border text-xs font-mono transition-all ${
                            isPreviewing
                              ? 'bg-amber-500 text-black border-amber-400 animate-pulse'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                          }`}
                          title={isPreviewing ? 'Detener' : 'Probar beat'}
                        >
                          {isPreviewing ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                        </button>

                        <button
                          onClick={(e) => handleAnalyzePreset(beat, e)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-300 border border-zinc-700 text-[10px] font-mono flex items-center gap-1 transition-all"
                          title="Analizar BPM y Tonalidad con el motor de IA/DSP"
                        >
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span className="hidden sm:inline">Detectar</span>
                        </button>

                        {isSelected ? (
                          <div className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center shrink-0">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              stopPreview();
                              onSelectBeat(beat);
                              onClose();
                            }}
                            className="text-xs font-mono px-2.5 py-1 rounded bg-zinc-800 hover:bg-amber-500 hover:text-black transition-colors"
                          >
                            Usar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
