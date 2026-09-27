'use client';

import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Music,
  Mic,
  Sliders,
  Play,
  Pause,
  Download,
  CheckCircle2,
  FolderPlus,
  RefreshCw,
  X,
  Upload,
  ArrowRight,
  Disc,
} from 'lucide-react';
import { BeatData, BeatAnalysisResult } from '@/lib/studio/types/audio';
import { extractWaveformPeaks } from '@/lib/studio/audio/wavEncoder';
import { analyzeBeatAudio } from '@/lib/studio/audio/beatAnalyzer';
import { ParkStorage } from '@/lib/park/storage';

interface AiMusicGeneratorTabProps {
  onUploadBeat: (beat: BeatData, detectedAnalysis?: BeatAnalysisResult, rawBuffer?: ArrayBuffer) => void;
  audioCtx: AudioContext | null;
  onClose: () => void;
}

export const AiMusicGeneratorTab: React.FC<AiMusicGeneratorTabProps> = ({
  onUploadBeat,
  audioCtx,
  onClose,
}) => {
  // References
  const [musicRefFile, setMusicRefFile] = useState<File | null>(null);
  const [vocalRefFile, setVocalRefFile] = useState<File | null>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const vocalInputRef = useRef<HTMLInputElement>(null);

  // Prompt & Style
  const [prompt, setPrompt] = useState<string>('');
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);
  const [customBpm, setCustomBpm] = useState<string>('');
  const [customKey, setCustomKey] = useState<string>('');
  const [instrumentalOnly, setInstrumentalOnly] = useState<boolean>(true);

  // State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generatedResult, setGeneratedResult] = useState<{
    title: string;
    bpm: number;
    key: string;
    audioUrl: string;
    instrumentalOnly: boolean;
    source: string;
  } | null>(null);

  // Audio Preview Player
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [isLoadingIntoStudio, setIsLoadingIntoStudio] = useState<boolean>(false);
  const [savedToPark, setSavedToPark] = useState<boolean>(false);

  const stylePresets = [
    { label: '🔥 Reggaeton Comercial', text: 'Beat de reggaeton moderno 96 BPM estilo Feid, bajo 808 profundo y sintes melódicos' },
    { label: '🌑 Trap Oscuro', text: 'Dark trap beat 140 BPM con bajos 808 pesados, hi-hats rápidos y campanas oscuras' },
    { label: '🌴 Afrobeat Melódico', text: 'Afrobeat suave 105 BPM con percusión orgánica, guitarra limpia y bajo cálido' },
    { label: '⚡ Dembow Urbano', text: 'Dembow rápido 118 BPM con ritmo enérgico de batería y bajo punzante' },
  ];

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !musicRefFile && !vocalRefFile) {
      alert('Por favor escribe una idea de estilo o sube un archivo de referencia de música o voz.');
      return;
    }

    setIsGenerating(true);
    setGeneratedResult(null);
    setIsPlaying(false);
    setSavedToPark(false);

    try {
      setGenerationStep('Analizando referencias de audio y melodía...');
      await new Promise((r) => setTimeout(r, 600));

      setGenerationStep('Conectando con el motor ACE-Step (Apple Silicon M3 Pro)...');
      await new Promise((r) => setTimeout(r, 800));

      setGenerationStep('Componiendo y renderizando instrumentación...');

      const response = await fetch('/api/ai/generate-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          musicReferenceName: musicRefFile ? musicRefFile.name : undefined,
          vocalReferenceName: vocalRefFile ? vocalRefFile.name : undefined,
          bpm: customBpm ? parseInt(customBpm, 10) : undefined,
          key: customKey.trim() || undefined,
          instrumentalOnly,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Error al generar la música');
      }

      const data = await response.json();
      setGeneratedResult(data);
    } catch (err: any) {
      console.error('Error generating AI beat:', err);
      alert(err.message || 'Error en la generación de música');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const togglePlayPreview = () => {
    if (!audioPreviewRef.current) return;
    if (isPlaying) {
      audioPreviewRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPreviewRef.current.play().catch((e) => console.error('Play error:', e));
      setIsPlaying(true);
    }
  };

  const handleLoadIntoStudio = async () => {
    if (!generatedResult) return;
    setIsLoadingIntoStudio(true);

    try {
      // Pause preview
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        setIsPlaying(false);
      }

      // Fetch the audio file and decode
      const res = await fetch(generatedResult.audioUrl);
      const arrayBuffer = await res.arrayBuffer();
      const arrayBufferForStorage = arrayBuffer.slice(0);

      let ctx = audioCtx;
      if (!ctx) {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AudioCtxClass();
      }
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // ignore
        }
      }

      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Analyze BPM and Key
      let analysisResult: BeatAnalysisResult | null = null;
      try {
        analysisResult = await analyzeBeatAudio(decodedBuffer);
      } catch (e) {
        console.warn('Analysis error:', e);
      }

      const finalBpm = analysisResult ? analysisResult.bpm : generatedResult.bpm;
      const finalKey = analysisResult
        ? `${analysisResult.rootKey}${analysisResult.scaleMode === 'minor' ? 'm' : ''}`
        : generatedResult.key;

      const waveform = extractWaveformPeaks(decodedBuffer, 64);

      const newBeat: BeatData = {
        id: `ai-beat-${Date.now()}`,
        title: generatedResult.title || 'AI Beat Instrumental',
        producer: 'ACE-Step IA (M3 Pro)',
        bpm: finalBpm,
        key: finalKey,
        scale: analysisResult ? (analysisResult.scaleMode === 'minor' ? 'Menor Natural' : 'Mayor') : 'Menor',
        duration: decodedBuffer.duration,
        buffer: decodedBuffer,
        artworkGradient: 'linear-gradient(135deg, #0e7490 0%, #0891b2 50%, #06b6d4 100%)',
        waveformSample: waveform,
        isCustomUpload: true,
        detectedBpm: finalBpm,
        detectedKey: finalKey,
        detectedConfidence: analysisResult?.confidence,
        isLocked: true,
      };

      onUploadBeat(newBeat, analysisResult || undefined, arrayBufferForStorage);
      onClose();
    } catch (err: any) {
      console.error('Error loading AI beat into Studio:', err);
      alert('Error cargando el audio en RGodbeat Studio: ' + err.message);
    } finally {
      setIsLoadingIntoStudio(false);
    }
  };

  const handleSaveToThePark = () => {
    if (!generatedResult) return;
    try {
      ParkStorage.createProjectFromBeat({
        title: generatedResult.title || 'AI Beat Instrumental',
        bpm: generatedResult.bpm,
        key: generatedResult.key,
        scale: generatedResult.key.toLowerCase().includes('major') ? 'Major' : 'Minor',
        genre: 'Urbano / IA',
        mood: 'Comercial',
        notes: `Generado con ACE-Step 1.5 en Apple Silicon M3 Pro. Modo: ${generatedResult.instrumentalOnly ? 'Solo Instrumental' : 'Con Voz'}.`,
        audioMasterUrl: generatedResult.audioUrl,
      });
      setSavedToPark(true);
    } catch (e: any) {
      console.error('Error saving to The Park:', e);
      alert('Error guardando en The Park: ' + e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div>
          <h3 className="text-xs font-bold font-mono text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            GENERADOR DE BEATS & MÚSICA CON IA (ACE-STEP 1.5)
          </h3>
          <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
            Crea música original desde texto o arrastra audios de referencia. Sube la pista instrumental, tu guía de voz y llévalo directo al estudio.
          </p>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 shrink-0">
          Apple M3 Pro Native
        </span>
      </div>

      <form onSubmit={handleGenerate} className="space-y-4">
        {/* Dual Reference Boxes: Music Reference & Vocal Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Reference 1: Music / Beat */}
          <div
            onClick={() => musicInputRef.current?.click()}
            className={`p-3 rounded-xl border border-dashed transition-all cursor-pointer flex flex-col justify-between ${
              musicRefFile
                ? 'bg-cyan-950/20 border-cyan-500/60'
                : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <input
              ref={musicInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setMusicRefFile(e.target.files?.[0] || null)}
            />
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-mono font-bold text-zinc-200 block">
                    1. Referencia Musical (Pista)
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 block">
                    {musicRefFile ? musicRefFile.name : 'Opcional • Sube beat o canción de guía'}
                  </span>
                </div>
              </div>
              {musicRefFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMusicRefFile(null);
                  }}
                  className="text-zinc-500 hover:text-red-400 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {!musicRefFile && (
              <div className="mt-2 text-[10px] font-mono text-cyan-400/80 flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Haz clic para elegir MP3 / WAV</span>
              </div>
            )}
          </div>

          {/* Reference 2: Vocal Reference */}
          <div
            onClick={() => vocalInputRef.current?.click()}
            className={`p-3 rounded-xl border border-dashed transition-all cursor-pointer flex flex-col justify-between ${
              vocalRefFile
                ? 'bg-amber-950/20 border-amber-500/60'
                : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <input
              ref={vocalInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setVocalRefFile(e.target.files?.[0] || null)}
            />
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-mono font-bold text-zinc-200 block">
                    2. Referencia Vocal (Guía)
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 block">
                    {vocalRefFile ? vocalRefFile.name : 'Opcional • Sube melodía cantada o tarareo'}
                  </span>
                </div>
              </div>
              {vocalRefFile && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setVocalRefFile(null);
                  }}
                  className="text-zinc-500 hover:text-red-400 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {!vocalRefFile && (
              <div className="mt-2 text-[10px] font-mono text-amber-400/80 flex items-center gap-1">
                <Upload className="w-3 h-3" />
                <span>Haz clic para subir voz o melodía</span>
              </div>
            )}
          </div>
        </div>

        {/* Style / Prompt Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-mono font-bold text-zinc-300">
              Estilo / Idea de la Música *
            </label>
            <span className="text-[10px] font-mono text-zinc-500">
              Funciona solo con la idea si no pones referencias
            </span>
          </div>
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ej. Beat de reggaeton comercial 96 BPM con bajos 808 profundos, percusión dinámica y sintetizadores melódicos oscuros..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-sans"
          />

          {/* Quick Style Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1.5 pb-1 scrollbar-none">
            {stylePresets.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(chip.text)}
                className="px-2 py-1 rounded-md text-[10px] font-mono bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-cyan-300 whitespace-nowrap transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selector & Optional Parameters (Tempo & Scale) */}
        <div className="bg-zinc-900/40 p-3 rounded-xl border border-zinc-800 space-y-3">
          {/* Mode Switch: Instrumental vs With Vocals */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/60 pb-3">
            <div>
              <span className="text-xs font-mono font-bold text-zinc-200 block">Modo de Exportación</span>
              <span className="text-[10px] font-mono text-zinc-400 block">
                {instrumentalOnly
                  ? '🎛️ Solo Instrumental (Ideal para cantar en Studio)'
                  : '🎤 Canción Completa con Voz (Escucha y descarga completa)'}
              </span>
            </div>

            <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => setInstrumentalOnly(true)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all ${
                  instrumentalOnly
                    ? 'bg-cyan-500 text-black shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Solo Instrumental
              </button>
              <button
                type="button"
                onClick={() => setInstrumentalOnly(false)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition-all ${
                  !instrumentalOnly
                    ? 'bg-amber-500 text-black shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Con Voz
              </button>
            </div>
          </div>

          {/* Optional Tempo & Scale Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
              className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-cyan-400 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showAdvancedParams ? 'Ocultar' : 'Ajustes opcionales de Tempo (BPM) y Escala'}</span>
              <span className="text-[10px] text-zinc-600">
                ({customBpm ? `${customBpm} BPM` : 'Auto'} • {customKey || 'Auto'})
              </span>
            </button>

            {showAdvancedParams && (
              <div className="grid grid-cols-2 gap-3 pt-3">
                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Tempo / BPM (Opcional)
                  </label>
                  <input
                    type="number"
                    min={60}
                    max={200}
                    placeholder="ej. 96 (Auto si está vacío)"
                    value={customBpm}
                    onChange={(e) => setCustomBpm(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Escala / Tono (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. D minor, F# minor (Auto)"
                    value={customKey}
                    onChange={(e) => setCustomKey(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Generate Action Button */}
        <div>
          <button
            type="submit"
            disabled={isGenerating}
            className={`w-full py-3 rounded-xl font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              isGenerating
                ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-lg shadow-cyan-500/20 active:scale-[0.99] cursor-pointer'
            }`}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>{generationStep || 'Componiendo música con IA...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-black" />
                <span>GENERAR MÚSICA & BEAT AHORA</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Generated Result Preview Section */}
      {generatedResult && (
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-cyan-950/40 via-zinc-900 to-zinc-950 border border-cyan-500/40 space-y-3">
          <audio
            ref={audioPreviewRef}
            src={generatedResult.audioUrl}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlayPreview}
                className="w-10 h-10 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black flex items-center justify-center shadow-md shadow-cyan-400/30 transition-transform active:scale-95"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
              </button>

              <div>
                <h4 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                  <span>{generatedResult.title}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                    {generatedResult.instrumentalOnly ? 'Solo Instrumental' : 'Con Voz'}
                  </span>
                </h4>
                <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 mt-0.5">
                  <span className="text-cyan-400 font-bold">{generatedResult.bpm} BPM</span>
                  <span>•</span>
                  <span>{generatedResult.key}</span>
                  <span>•</span>
                  <span>{isPlaying ? 'Reproduciendo vista previa...' : 'Listo'}</span>
                </div>
              </div>
            </div>

            <a
              href={generatedResult.audioUrl}
              download={`${generatedResult.title || 'beat'}.mp3`}
              className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors flex items-center gap-1.5 text-[11px] font-mono"
              title="Descargar audio MP3"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Descargar</span>
            </a>
          </div>

          {/* Action Buttons: Studio & The Park */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-zinc-800/80">
            {/* Load directly into RGodbeat Studio */}
            <button
              type="button"
              onClick={handleLoadIntoStudio}
              disabled={isLoadingIntoStudio}
              className="w-full py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all active:scale-[0.98]"
            >
              {isLoadingIntoStudio ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Cargando en Studio...</span>
                </>
              ) : (
                <>
                  <Disc className="w-3.5 h-3.5" />
                  <span>🚀 CARGAR A RGODBEAT STUDIO</span>
                </>
              )}
            </button>

            {/* Save into The Park Rights Control Center */}
            <button
              type="button"
              onClick={handleSaveToThePark}
              disabled={savedToPark}
              className={`w-full py-2.5 px-3 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                savedToPark
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                  : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white'
              }`}
            >
              {savedToPark ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>REGISTRADO EN THE PARK</span>
                </>
              ) : (
                <>
                  <FolderPlus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>📁 Guardar en The Park</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
