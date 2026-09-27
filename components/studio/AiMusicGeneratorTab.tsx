'use client';

import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Music,
  Mic,
  Play,
  Pause,
  Download,
  X,
  RefreshCw,
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

  // Prompt & Parameters
  const [prompt, setPrompt] = useState<string>('');
  const [customBpm, setCustomBpm] = useState<string>('');
  const [customKey, setCustomKey] = useState<string>('');
  const [instrumentalOnly, setInstrumentalOnly] = useState<boolean>(true);

  // State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
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

  // Popular Genre References
  const genres = [
    { label: '🔥 Reggaeton', text: 'Beat de reggaeton comercial, bajo 808 profundo, sintes melódicos', bpm: '96', key: 'D minor' },
    { label: '🌑 Trap', text: 'Dark trap beat con 808 pesado, hi-hats rápidos y campana menor', bpm: '140', key: 'C minor' },
    { label: '🌴 Afrobeat', text: 'Afrobeat moderno con percusión orgánica, guitarra limpia y bajo cálido', bpm: '104', key: 'A minor' },
    { label: '⚡ Dembow', text: 'Dembow enérgico con ritmo bailable, bajo corto y percusión agresiva', bpm: '118', key: 'F minor' },
    { label: '🚀 Drill', text: 'Drill agresivo con 808 slides, melodía oscura de piano y cuerdas', bpm: '142', key: 'G minor' },
    { label: '🎸 Guitar Melodic', text: 'Trap melódico con guitarra acústica triste, bajo suave y ritmo limpio', bpm: '130', key: 'E minor' },
    { label: '🎹 R&B / Soul', text: 'Smooth R&B beat con acordes de Rhodes, bajo suave y batería lenta', bpm: '85', key: 'Bb major' },
  ];

  const handleSelectGenre = (g: typeof genres[0]) => {
    setPrompt(g.text);
    if (!customBpm) setCustomBpm(g.bpm);
    if (!customKey) setCustomKey(g.key);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !musicRefFile && !vocalRefFile) {
      alert('Escribe una idea o selecciona un género arriba.');
      return;
    }

    setIsGenerating(true);
    setGeneratedResult(null);
    setIsPlaying(false);

    try {
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
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        setIsPlaying(false);
      }

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
        producer: 'ACE IA (M3 Pro)',
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

      // Also register in The Park catalog
      try {
        ParkStorage.createProjectFromBeat({
          title: newBeat.title,
          bpm: newBeat.bpm,
          key: newBeat.key,
          scale: newBeat.scale.includes('Mayor') ? 'Major' : 'Minor',
          genre: 'IA Urban',
          audioMasterUrl: generatedResult.audioUrl,
        });
      } catch {
        // ignore
      }

      onUploadBeat(newBeat, analysisResult || undefined, arrayBufferForStorage);
      onClose();
    } catch (err: any) {
      console.error('Error loading AI beat into Studio:', err);
      alert('Error cargando el audio en Studio: ' + err.message);
    } finally {
      setIsLoadingIntoStudio(false);
    }
  };

  return (
    <div className="space-y-3 font-sans">
      {/* Hidden file inputs */}
      <input
        ref={musicInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => setMusicRefFile(e.target.files?.[0] || null)}
      />
      <input
        ref={vocalInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => setVocalRefFile(e.target.files?.[0] || null)}
      />

      {/* 1. Referencias de Géneros (Chips interactivos) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {genres.map((g, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSelectGenre(g)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-cyan-300 whitespace-nowrap transition-colors shrink-0"
          >
            {g.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleGenerate} className="space-y-3">
        {/* 2. Textarea Prompt Minimalista */}
        <div>
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe tu beat o selecciona un género arriba..."
            className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-sans resize-none"
          />
        </div>

        {/* 3. Barra de Controles Compacta (Referencias + Tempo/Escala + Modo) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Referencia Musical */}
          <button
            type="button"
            onClick={() => musicInputRef.current?.click()}
            className={`h-9 px-2.5 rounded-lg border text-[11px] font-mono flex items-center justify-between gap-1.5 transition-all truncate ${
              musicRefFile
                ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title={musicRefFile ? musicRefFile.name : 'Subir pista de referencia'}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Music className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
              <span className="truncate">{musicRefFile ? musicRefFile.name : 'Pista Ref'}</span>
            </div>
            {musicRefFile && (
              <X
                className="w-3 h-3 text-zinc-500 hover:text-red-400 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setMusicRefFile(null);
                }}
              />
            )}
          </button>

          {/* Referencia Vocal */}
          <button
            type="button"
            onClick={() => vocalInputRef.current?.click()}
            className={`h-9 px-2.5 rounded-lg border text-[11px] font-mono flex items-center justify-between gap-1.5 transition-all truncate ${
              vocalRefFile
                ? 'bg-amber-950/40 border-amber-500 text-amber-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title={vocalRefFile ? vocalRefFile.name : 'Subir voz de referencia'}
          >
            <div className="flex items-center gap-1.5 truncate">
              <Mic className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span className="truncate">{vocalRefFile ? vocalRefFile.name : 'Voz Ref'}</span>
            </div>
            {vocalRefFile && (
              <X
                className="w-3 h-3 text-zinc-500 hover:text-red-400 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setVocalRefFile(null);
                }}
              />
            )}
          </button>

          {/* Tempo BPM & Key (Minimalistas) */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 h-9">
            <span className="text-[10px] font-mono text-zinc-500">BPM</span>
            <input
              type="number"
              placeholder="Auto"
              value={customBpm}
              onChange={(e) => setCustomBpm(e.target.value)}
              className="w-12 bg-transparent text-xs text-zinc-200 font-mono text-center focus:outline-none"
            />
            <span className="text-zinc-700">|</span>
            <input
              type="text"
              placeholder="Tono"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="w-14 bg-transparent text-xs text-zinc-200 font-mono text-center focus:outline-none"
            />
          </div>

          {/* Selector de Modo */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 h-9">
            <button
              type="button"
              onClick={() => setInstrumentalOnly(true)}
              className={`flex-1 h-full rounded text-[10px] font-mono font-bold transition-all ${
                instrumentalOnly
                  ? 'bg-cyan-500 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Beat
            </button>
            <button
              type="button"
              onClick={() => setInstrumentalOnly(false)}
              className={`flex-1 h-full rounded text-[10px] font-mono font-bold transition-all ${
                !instrumentalOnly
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Con Voz
            </button>
          </div>
        </div>

        {/* 4. Botón Generar Minimalista */}
        <button
          type="submit"
          disabled={isGenerating}
          className={`w-full h-10 rounded-xl font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            isGenerating
              ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
              : 'bg-cyan-400 hover:bg-cyan-300 text-black shadow-md shadow-cyan-500/20 active:scale-[0.99] cursor-pointer'
          }`}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              <span>Generando beat con IA...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-black" />
              <span>Generar Beat</span>
            </>
          )}
        </button>
      </form>

      {/* 5. Reproductor de Resultado (Ultra Limpio) */}
      {generatedResult && (
        <div className="p-3 rounded-xl bg-zinc-900 border border-cyan-500/50 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
          <audio
            ref={audioPreviewRef}
            src={generatedResult.audioUrl}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={togglePlayPreview}
              className="w-9 h-9 rounded-full bg-cyan-400 hover:bg-cyan-300 text-black flex items-center justify-center shrink-0 shadow-sm transition-transform active:scale-95"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black ml-0.5" />}
            </button>

            <div className="min-w-0">
              <p className="text-xs font-bold text-white font-mono truncate">{generatedResult.title}</p>
              <p className="text-[10px] font-mono text-cyan-400">
                {generatedResult.bpm} BPM • {generatedResult.key}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <a
              href={generatedResult.audioUrl}
              download={`${generatedResult.title || 'beat'}.mp3`}
              className="h-8 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-mono flex items-center justify-center gap-1 transition-colors"
              title="Descargar MP3"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Descargar</span>
            </a>

            <button
              type="button"
              onClick={handleLoadIntoStudio}
              disabled={isLoadingIntoStudio}
              className="flex-1 sm:flex-initial h-8 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
            >
              {isLoadingIntoStudio ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Cargando...</span>
                </>
              ) : (
                <>
                  <Disc className="w-3 h-3" />
                  <span>Cargar al Studio</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
