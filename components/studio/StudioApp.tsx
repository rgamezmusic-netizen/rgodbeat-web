"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  BeatAnalysisResult,
  BeatData,
  BeatFX,
  LoopSettings,
  VocalClip,
  VocalFX,
  VocalTrack,
  VocalTrackId,
} from '@/lib/studio/types/audio';
import { AudioEngine } from '@/lib/studio/audio/audioEngine';
import { createDemoBeat } from '@/lib/studio/audio/demoBeats';
import { analyzeBeatAudio } from '@/lib/studio/audio/beatAnalyzer';
import {
  saveBeatToDatabase,
  getAllSavedBeats,
  deleteSavedBeat,
  saveActiveBeatId,
  getActiveBeatSettings,
  MAX_SAVED_BEATS,
} from '@/lib/studio/audio/beatStorage';
import { TopBar } from './TopBar';
import { ArtworkPlayer } from './ArtworkPlayer';
import { RecordControlBar } from './RecordControlBar';
import { VocalTracksList } from './VocalTracksList';
import { TimelineWorkspace } from './TimelineWorkspace';
import { VocalFXModal } from './VocalFXModal';
import { BeatFXModal } from './BeatFXModal';
import { LoopModal } from './LoopModal';
import { LoadBeatModal } from './LoadBeatModal';
import { ExportModal } from './ExportModal';
import { UnlockPassModal } from './UnlockPassModal';
import { CountInOverlay } from './CountInOverlay';
import { AlertCircle, CheckCircle, Info, Disc3, Layers, HardDrive } from 'lucide-react';

const defaultVocalFX = (): VocalFX => ({
  tune: {
    enabled: false,
    speed: 0.0, // 0 is clicked OFF detent
    tonalityId: 'Am_C',
    rootKey: 'A',
    scaleMode: 'minor',
    humanize: 0.1,
  },
  eq: {
    lowCut: true,
    lowCutFreq: 100,
    low: 0,
    mid: 0,
    high: 0,
  },
  comp: {
    amount: 0.35, // light natural vocal compression
  },
  saturation: {
    amount: 0.15, // subtle tape warmth
  },
  delay: {
    division: 'OFF',
    mix: 0.25,
    feedback: 0.35,
  },
  reverb: {
    preset: 'PLATE',
    mix: 0.2, // subtle ambience
  },
});

// 6 Vocal Tracks: Lead 1, Lead 2, Double, Harmony 1, Harmony 2, Adlibs
const initialTracks: VocalTrack[] = [
  {
    id: 'lead1',
    name: 'Lead 1',
    buffer: null,
    duration: 0,
    startBeatOffset: 0,
    volume: 1.0,
    pan: 0,
    isMuted: false,
    isSolo: false,
    fx: defaultVocalFX(),
    clips: [],
  },
  {
    id: 'lead2',
    name: 'Lead 2',
    buffer: null,
    duration: 0,
    startBeatOffset: 0,
    volume: 1.0,
    pan: 0,
    isMuted: false,
    isSolo: false,
    fx: {
      ...defaultVocalFX(),
      comp: { amount: 0.4 },
      reverb: { preset: 'PLATE', mix: 0.25 },
    },
    clips: [],
  },
  {
    id: 'double',
    name: 'Double',
    buffer: null,
    duration: 0,
    startBeatOffset: 0,
    volume: 0.85,
    pan: -0.3,
    isMuted: false,
    isSolo: false,
    fx: {
      ...defaultVocalFX(),
      comp: { amount: 0.45 },
      reverb: { preset: 'ROOM', mix: 0.15 },
    },
    clips: [],
  },
  {
    id: 'harmony1',
    name: 'Harmony 1',
    buffer: null,
    duration: 0,
    startBeatOffset: 0,
    volume: 0.8,
    pan: -0.6,
    isMuted: false,
    isSolo: false,
    fx: {
      ...defaultVocalFX(),
      reverb: { preset: 'HALL', mix: 0.3 },
    },
    clips: [],
  },
  {
    id: 'harmony2',
    name: 'Harmony 2',
    buffer: null,
    duration: 0,
    startBeatOffset: 0,
    volume: 0.8,
    pan: 0.6,
    isMuted: false,
    isSolo: false,
    fx: {
      ...defaultVocalFX(),
      reverb: { preset: 'HALL', mix: 0.35 },
    },
    clips: [],
  },
  {
    id: 'adlibs',
    name: 'Adlibs',
    buffer: null,
    duration: 0,
    startBeatOffset: 0,
    volume: 0.9,
    pan: 0.35,
    isMuted: false,
    isSolo: false,
    fx: {
      ...defaultVocalFX(),
      saturation: { amount: 0.4 },
      delay: { division: '1/4', mix: 0.35, feedback: 0.4 },
      reverb: { preset: 'HALL', mix: 0.4 },
    },
    clips: [],
  },
];

export default function App() {
  const [engine, setEngine] = useState<AudioEngine | null>(null);
  const [demoBeats, setDemoBeats] = useState<BeatData[]>([]);
  const [savedCustomBeats, setSavedCustomBeats] = useState<BeatData[]>([]);
  const [isBeatLocked, setIsBeatLocked] = useState<boolean>(false);
  const [currentBeat, setCurrentBeat] = useState<BeatData | null>(null);
  const currentBeatRef = useRef<BeatData | null>(null);
  currentBeatRef.current = currentBeat;

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  isRecordingRef.current = isRecording;

  const [activeRecordingTrackId, setActiveRecordingTrackId] = useState<VocalTrackId | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<VocalTrackId>('lead1');
  const [countInBeat, setCountInBeat] = useState<number>(0);
  const [countInEnabled, setCountInEnabled] = useState<boolean>(true);
  const [isAnalyzingBeat, setIsAnalyzingBeat] = useState<boolean>(false);

  // View state: 'studio' (Player & Strips) | 'editor' (Timeline Multitrack with moveable takes)
  const [activeView, setActiveView] = useState<'studio' | 'editor'>('studio');

  // Vocal Tracks with 2 Leads
  const [tracks, setTracks] = useState<VocalTrack[]>(initialTracks);
  const tracksRef = useRef<VocalTrack[]>(initialTracks);
  tracksRef.current = tracks;

  // History stack for Undo and Redo
  interface HistorySnapshot {
    tracks: VocalTrack[];
    description: string;
  }
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const cloneTracks = (source: VocalTrack[]): VocalTrack[] => {
    return source.map((t) => ({
      ...t,
      fx: {
        ...t.fx,
        tune: { ...t.fx.tune },
        eq: { ...t.fx.eq },
        comp: { ...t.fx.comp },
        saturation: { ...t.fx.saturation },
        delay: { ...t.fx.delay },
        reverb: { ...t.fx.reverb },
      },
      clips: t.clips ? t.clips.map((c) => ({ ...c })) : [],
    }));
  };

  const pushUndoSnapshot = (description: string) => {
    const snapshot = cloneTracks(tracksRef.current);
    setUndoStack((prev) => [...prev.slice(-25), { tracks: snapshot, description }]);
    setRedoStack([]); // Clears redo future upon new action
  };

  // Dedicated drag-and-drop snapshot handling so Undo/Redo moves samples back and forth cleanly
  const preDragTracksSnapshotRef = useRef<VocalTrack[] | null>(null);

  const handleStartDragMove = () => {
    // Capture the pristine state BEFORE the user moves the sample
    preDragTracksSnapshotRef.current = cloneTracks(tracksRef.current);
  };

  const handleCommitDragMove = (trackId: VocalTrackId, initialOffset: number, clipId?: string) => {
    if (!preDragTracksSnapshotRef.current) return;
    const currentTrack = tracksRef.current.find((t) => t.id === trackId);
    const clip = currentTrack?.clips?.find((c) => !clipId || c.id === clipId);
    const currentOffset = clip ? clip.startBeatOffset : currentTrack?.startBeatOffset || 0;

    // Only commit if the clip actually moved more than 20ms
    if (Math.abs(currentOffset - initialOffset) > 0.02) {
      setUndoStack((prev) => [
        ...prev.slice(-25),
        { tracks: preDragTracksSnapshotRef.current!, description: 'Mover toma' },
      ]);
      setRedoStack([]); // Reset redo stack on new action
    }
    preDragTracksSnapshotRef.current = null;
  };

  const handleUndo = () => {
    if (undoStack.length === 0) {
      showToast('No hay más acciones para deshacer', 'info');
      return;
    }
    const currentSnapshot = cloneTracks(tracksRef.current);
    const lastEntry = undoStack[undoStack.length - 1];
    const nextUndo = undoStack.slice(0, -1);

    setRedoStack((prev) => [...prev, { tracks: currentSnapshot, description: lastEntry.description }]);
    setUndoStack(nextUndo);
    setTracks(lastEntry.tracks);
    tracksRef.current = lastEntry.tracks;
    if (engine && isPlaying) {
      engine.seek(currentTime, lastEntry.tracks);
    }
    showToast(`Deshecho: ${lastEntry.description}`, 'info');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) {
      showToast('No hay más acciones para rehacer', 'info');
      return;
    }
    const currentSnapshot = cloneTracks(tracksRef.current);
    const nextEntry = redoStack[redoStack.length - 1];
    const nextRedo = redoStack.slice(0, -1);

    setUndoStack((prev) => [...prev, { tracks: currentSnapshot, description: nextEntry.description }]);
    setRedoStack(nextRedo);
    setTracks(nextEntry.tracks);
    tracksRef.current = nextEntry.tracks;
    if (engine && isPlaying) {
      engine.seek(currentTime, nextEntry.tracks);
    }
    showToast(`Rehecho: ${nextEntry.description}`, 'info');
  };

  // Global Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack]);

  // Settings & FX
  const [loopSettings, setLoopSettings] = useState<LoopSettings>({
    enabled: false,
    bars: 8,
    startBar: 0,
    startSec: 0,
    endSec: 0,
  });

  const [beatFX, setBeatFX] = useState<BeatFX>({
    lowPass: 20000,
    highPass: 20,
    volume: 1.0,
  });

  // Studio Access & Subscription state
  const [accessStatus, setAccessStatus] = useState<{
    isDemo: boolean;
    hasActivePass: boolean;
    daysRemaining: number;
    expiresAt: string | null;
    email: string | null;
    name: string;
  }>({
    isDemo: true,
    hasActivePass: false,
    daysRemaining: 0,
    expiresAt: null,
    email: null,
    name: 'Artista',
  });
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockModalReason, setUnlockModalReason] = useState<'export' | 'tracks' | 'general'>('general');

  useEffect(() => {
    async function checkStudioAccess() {
      try {
        const res = await fetch('/api/studio/access');
        if (res.ok) {
          const data = await res.json();
          setAccessStatus({
            isDemo: data.isDemo,
            hasActivePass: data.hasActivePass,
            daysRemaining: data.daysRemaining || 0,
            expiresAt: data.expiresAt,
            email: data.email,
            name: data.name || 'Artista',
          });
        }
      } catch (err) {
        console.error('Error checking studio access:', err);
      }
    }
    checkStudioAccess();
  }, []);

  // Modals state
  const [activeFXTrackId, setActiveFXTrackId] = useState<VocalTrackId | null>(null);
  const [showBeatFXModal, setShowBeatFXModal] = useState<boolean>(false);
  const [showLoopModal, setShowLoopModal] = useState<boolean>(false);
  const [showLoadBeatModal, setShowLoadBeatModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'info' | 'success' | 'error';
  } | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const showToast = (text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Initialize AudioEngine
  useEffect(() => {
    const audioEngine = new AudioEngine({
      onTimeUpdate: (time) => {
        setCurrentTime(time);
      },
      onPlaybackEnded: () => {
        setIsPlaying(false);
        if (audioEngine.getIsRecording()) {
          audioEngine.stopRecording();
        }
      },
      onCountInBeat: (beat) => {
        setCountInBeat(beat);
      },
      onRecordingFinished: (trackId, buffer, waveform) => {
        setIsRecording(false);
        setActiveRecordingTrackId(null);
        setIsPlaying(false);

        // Record history snapshot before adding take so user can undo it
        pushUndoSnapshot('Grabación de voz');

        const startOffset = audioEngine.getRecordingStartBeatTime();
        const newClipId = `clip-${trackId}-${Date.now()}`;
        setTracks((prev) => {
          const next = prev.map((t) => {
            if (t.id !== trackId) return t;

            const existingClips: VocalClip[] = (t.clips && t.clips.length > 0)
              ? [...t.clips]
              : t.buffer
              ? [{
                  id: `clip-${t.id}-init`,
                  buffer: t.buffer,
                  tunedBuffer: t.tunedBuffer,
                  startBeatOffset: t.startBeatOffset,
                  duration: t.duration,
                  waveformSample: t.waveformSample,
                  name: 'Toma 1',
                }]
              : [];

            const newClip: VocalClip = {
              id: newClipId,
              buffer,
              tunedBuffer: null,
              startBeatOffset: startOffset,
              duration: buffer.duration,
              waveformSample: waveform,
              name: `Toma ${existingClips.length + 1}`,
            };

            const updatedClips = [...existingClips, newClip];
            const maxTrackDuration = Math.max(
              t.duration || 0,
              startOffset + buffer.duration
            );

            return {
              ...t,
              clips: updatedClips,
              buffer, // latest buffer for legacy helpers
              duration: maxTrackDuration,
              startBeatOffset: startOffset,
              waveformSample: waveform,
              tunedBuffer: null,
            };
          });
          tracksRef.current = next;

          // If pitch correction is active on this track, process immediately
          const updatedTrack = next.find((t) => t.id === trackId);
          if (updatedTrack && updatedTrack.fx.tune?.enabled && updatedTrack.fx.tune.speed > 0.01) {
            audioEngine.updateTuneForTrack(updatedTrack).then((tuned) => {
              if (tuned) {
                const clip = updatedTrack.clips?.find((c) => c.id === newClipId);
                if (clip) clip.tunedBuffer = tuned;
                updatedTrack.tunedBuffer = tuned;
                setTracks([...next]);
                tracksRef.current = [...next];
              }
            });
          }

          return next;
        });

        const trackName = tracksRef.current.find((t) => t.id === trackId)?.name || trackId;
        showToast(`¡Toma grabada en ${trackName}! Agregada a la línea de tiempo.`, 'success');
      },
      onRecordingAborted: () => {
        setIsRecording(false);
        setActiveRecordingTrackId(null);
        setIsPlaying(false);
        setCountInBeat(0);
      },
      onError: (msg) => {
        setIsRecording(false);
        setActiveRecordingTrackId(null);
        setIsPlaying(false);
        setCountInBeat(0);
        showToast(msg, 'error');
      },
    });

    setEngine(audioEngine);

    // Generate demo beats and restore saved custom beats from IndexedDB
    (async () => {
      try {
        const audioCtx = await audioEngine.ensureAudioContext();

        // 1. Fetch saved custom beats from persistent IndexedDB
        const storedBeats = await getAllSavedBeats(audioCtx);
        setSavedCustomBeats(storedBeats);

        // 2. Fetch saved active beat preference and lock status
        const { activeBeatId, isLocked } = await getActiveBeatSettings();

        // 3. Generate initial offline demo beats
        const trapBeat = await createDemoBeat(audioCtx, 'trap');
        const rnbBeat = await createDemoBeat(audioCtx, 'rnb');
        const drillBeat = await createDemoBeat(audioCtx, 'drill');

        const beats = [trapBeat, rnbBeat, drillBeat];
        setDemoBeats(beats);

        // 4. Select initial beat:
        // CRITICAL CHECK: If user already uploaded or selected a beat before this async finished,
        // NEVER OVERWRITE IT!
        if (currentBeatRef.current) {
          return;
        }

        let chosenBeat: BeatData = trapBeat;
        let chosenLock = isLocked;

        if (storedBeats.length > 0) {
          const matchedStored = storedBeats.find((b) => b.id === activeBeatId);
          if (matchedStored) {
            chosenBeat = matchedStored;
          } else {
            chosenBeat = storedBeats[0];
          }
          chosenLock = true; // Custom beats are locked by default so they don't get lost
        } else if (activeBeatId) {
          const matchedPreset = beats.find((b) => b.id === activeBeatId);
          if (matchedPreset) chosenBeat = matchedPreset;
        }

        if (currentBeatRef.current) return;

        setCurrentBeat(chosenBeat);
        currentBeatRef.current = chosenBeat;
        setIsBeatLocked(chosenLock);
        audioEngine.setBeat(chosenBeat);
      } catch (err) {
        console.error('Initial beat generation/restore error:', err);
      }
    })();

    return () => {
      audioEngine.stop();
    };
  }, []);

  // Update beat loop bounds when beat or loop settings change
  useEffect(() => {
    if (engine) {
      engine.setLoopSettings(loopSettings);
    }
  }, [loopSettings, engine]);

  // Update beat FX when parameters change
  useEffect(() => {
    if (engine) {
      engine.setBeatFX(beatFX);
    }
  }, [beatFX, engine]);

  // Automatic Beat BPM & Key Detection on demand
  const handleDetectCurrentBeat = async () => {
    if (!currentBeat || !currentBeat.buffer) {
      showToast('Carga un beat para analizarlo', 'info');
      return;
    }

    try {
      setIsAnalyzingBeat(true);
      showToast('Analizando tempo y tonalidad del beat con motor DSP...', 'info');

      const result = await analyzeBeatAudio(currentBeat.buffer);

      const updatedBeat: BeatData = {
        ...currentBeat,
        bpm: result.bpm,
        key: result.key,
        scale: result.scaleMode === 'minor' ? 'Menor Natural' : 'Mayor',
        detectedBpm: result.bpm,
        detectedKey: result.key,
        detectedConfidence: result.confidence,
      };

      setCurrentBeat(updatedBeat);
      if (engine) engine.setBeat(updatedBeat);

      // Auto-sync vocal tune root key & scale mode to all tracks
      const newTracks = tracks.map((t) => ({
        ...t,
        fx: {
          ...t.fx,
          tune: {
            ...(t.fx.tune || defaultVocalFX().tune),
            rootKey: result.rootKey,
            scaleMode: result.scaleMode,
            tonalityId: result.matchingPopularTonality,
          },
        },
        tunedBuffer: null,
      }));
      setTracks(newTracks);
      tracksRef.current = newTracks;

      setIsAnalyzingBeat(false);
      showToast(
        `⚡ ¡Beat detectado!: ${result.bpm} BPM • ${result.tonalityName} (${result.confidence}% confianza)`,
        'success'
      );
    } catch (err) {
      console.error('Beat analysis error:', err);
      setIsAnalyzingBeat(false);
      showToast('No se pudo analizar el beat', 'error');
    }
  };

  // Transport Handlers
  const handlePlayPause = async () => {
    if (!engine || !currentBeat) return;
    if (isRecording) {
      handleStopRecord();
      return;
    }
    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      await engine.play(tracksRef.current);
      setIsPlaying(true);
    }
  };

  const handleSeek = (timeSec: number) => {
    if (!engine) return;
    if (isRecording) {
      handleStopRecord();
    }
    engine.seek(timeSec, tracksRef.current);
  };

  const handleToggleLoop = () => {
    setLoopSettings((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  };

  // Recording workflow
  const handleStartRecord = async (trackId: VocalTrackId) => {
    if (!engine) return;

    // In Demo Mode: only lead1 can record
    if (accessStatus.isDemo && trackId !== 'lead1') {
      showToast('En Modo Demo solo puedes grabar 1 pista (Lead 1). Activa tu pase para desbloquear 4 pistas vocales.', 'info');
      setUnlockModalReason('tracks');
      setIsUnlockModalOpen(true);
      return;
    }

    // Check if replacing take
    const targetTrack = tracks.find((t) => t.id === trackId);
    if (targetTrack?.buffer) {
      showToast(`Reemplazando toma en ${targetTrack.name}...`, 'info');
    }

    setSelectedTrackId(trackId);
    setActiveRecordingTrackId(trackId);
    setIsRecording(true);

    const started = await engine.startRecording(trackId, tracksRef.current, countInEnabled);
    if (started) {
      setIsPlaying(true);
    } else {
      setIsRecording(false);
      setActiveRecordingTrackId(null);
    }
  };

  const handleStopRecord = () => {
    if (!engine) return;
    engine.stopRecording();
  };

  // Move / Edit take position along timeline
  const handleMoveTake = (
    trackId: VocalTrackId,
    newOffsetSec: number,
    clipId?: string,
    recordHistory: boolean = false
  ) => {
    if (recordHistory) {
      pushUndoSnapshot('Mover toma');
    }
    const clampedOffset = Math.max(0, newOffsetSec);
    const updated = tracksRef.current.map((t) => {
      if (t.id !== trackId) return t;

      let currentClips = t.clips && t.clips.length > 0 ? [...t.clips] : [];
      if (currentClips.length === 0 && t.buffer) {
        currentClips = [
          {
            id: clipId || `clip-${t.id}-init`,
            buffer: t.buffer,
            tunedBuffer: t.tunedBuffer,
            startBeatOffset: clampedOffset,
            duration: t.duration,
            waveformSample: t.waveformSample,
            name: 'Toma 1',
          },
        ];
      } else {
        currentClips = currentClips.map((c) =>
          !clipId || c.id === clipId ? { ...c, startBeatOffset: clampedOffset } : c
        );
      }

      const maxDuration =
        currentClips.length > 0
          ? Math.max(...currentClips.map((c) => c.startBeatOffset + c.duration))
          : t.duration;
      const activeClip = clipId ? currentClips.find((c) => c.id === clipId) : currentClips[currentClips.length - 1];

      return {
        ...t,
        clips: currentClips,
        startBeatOffset: activeClip ? activeClip.startBeatOffset : clampedOffset,
        duration: maxDuration,
      };
    });

    setTracks(updated);
    tracksRef.current = updated;
    if (engine && isPlaying) {
      engine.seek(engine.getCurrentPlaybackPosition(), updated);
    }
  };

  // Duplicate take across tracks (e.g. Lead 1 -> Lead 2)
  const handleDuplicateTake = (
    sourceTrackId: VocalTrackId,
    targetTrackId: VocalTrackId,
    clipId?: string
  ) => {
    const source = tracks.find((t) => t.id === sourceTrackId);
    if (!source) {
      showToast('No hay toma para duplicar', 'error');
      return;
    }

    const clips = (source.clips && source.clips.length > 0)
      ? source.clips
      : source.buffer
      ? [{
          id: `clip-${source.id}-init`,
          buffer: source.buffer,
          tunedBuffer: source.tunedBuffer,
          startBeatOffset: source.startBeatOffset,
          duration: source.duration,
          waveformSample: source.waveformSample,
          name: 'Toma 1',
        }]
      : [];

    const targetClip = (clipId ? clips.find((c) => c.id === clipId) : null) || clips[clips.length - 1];
    if (!targetClip || !targetClip.buffer) {
      showToast('No hay toma para duplicar', 'error');
      return;
    }

    pushUndoSnapshot(`Duplicar toma a ${targetTrackId}`);

    const duplicatedClip: VocalClip = {
      id: `clip-${targetTrackId}-${Date.now()}`,
      buffer: targetClip.buffer,
      tunedBuffer: null,
      startBeatOffset: targetClip.startBeatOffset,
      duration: targetClip.duration,
      waveformSample: targetClip.waveformSample ? [...targetClip.waveformSample] : undefined,
      name: `${targetClip.name || 'Toma'} (Copia)`,
    };

    const target = tracks.find((t) => t.id === targetTrackId);
    const updated = tracks.map((t) => {
      if (t.id !== targetTrackId) return t;

      const existingClips = (t.clips && t.clips.length > 0)
        ? [...t.clips]
        : t.buffer
        ? [{
            id: `clip-${t.id}-init`,
            buffer: t.buffer,
            tunedBuffer: t.tunedBuffer,
            startBeatOffset: t.startBeatOffset,
            duration: t.duration,
            waveformSample: t.waveformSample,
            name: 'Toma 1',
          }]
        : [];

      const newClips = [...existingClips, duplicatedClip];
      return {
        ...t,
        clips: newClips,
        buffer: duplicatedClip.buffer,
        duration: Math.max(t.duration, duplicatedClip.startBeatOffset + duplicatedClip.duration),
        startBeatOffset: duplicatedClip.startBeatOffset,
        waveformSample: duplicatedClip.waveformSample,
        tunedBuffer: null,
      };
    });

    setTracks(updated);
    tracksRef.current = updated;
    showToast(`Toma de ${source.name} duplicada a ${target?.name || targetTrackId}`, 'success');
  };

  // Synthetic Test Take Generator for zero-friction testing without mic
  const handleGenerateTestTake = (trackId: VocalTrackId) => {
    if (!engine) return;
    try {
      pushUndoSnapshot('Generar toma de prueba');
      const { buffer, waveform } = engine.generateTestVocalTake(trackId);
      const startOffset = 0;
      const testClip: VocalClip = {
        id: `clip-${trackId}-${Date.now()}`,
        buffer,
        tunedBuffer: null,
        startBeatOffset: startOffset,
        duration: buffer.duration,
        waveformSample: waveform,
        name: 'Toma de Prueba',
      };
      setTracks((prev) => {
        const next = prev.map((t) =>
          t.id === trackId
            ? {
                ...t,
                buffer,
                duration: buffer.duration,
                startBeatOffset: startOffset,
                waveformSample: waveform,
                tunedBuffer: null,
                clips: [testClip],
              }
            : t
        );
        tracksRef.current = next;

        const updatedTrack = next.find((t) => t.id === trackId);
        if (updatedTrack && updatedTrack.fx.tune?.enabled && updatedTrack.fx.tune.speed > 0.01) {
          engine.updateTuneForTrack(updatedTrack).then((tuned) => {
            if (tuned) {
              updatedTrack.tunedBuffer = tuned;
              setTracks([...next]);
              tracksRef.current = [...next];
            }
          });
        }
        return next;
      });
      const targetName = tracks.find((t) => t.id === trackId)?.name || trackId;
      showToast(`¡Toma de prueba generada en ${targetName}! Presiona PLAY para escuchar.`, 'success');
    } catch (e) {
      console.error(e);
      showToast('Error al generar la toma de prueba', 'error');
    }
  };

  // Track Mixer actions
  const handleToggleMute = (trackId: VocalTrackId) => {
    const updated = tracks.map((t) =>
      t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
    );
    setTracks(updated);
    if (engine) {
      const target = updated.find((t) => t.id === trackId);
      if (target) engine.updateVocalFX(target, updated);
    }
  };

  const handleToggleSolo = (trackId: VocalTrackId) => {
    const updated = tracks.map((t) =>
      t.id === trackId ? { ...t, isSolo: !t.isSolo } : t
    );
    setTracks(updated);
    if (engine) {
      updated.forEach((t) => engine.updateVocalFX(t, updated));
    }
  };

  const handleChangeTrackVolume = (trackId: VocalTrackId, volume: number) => {
    const updated = tracks.map((t) =>
      t.id === trackId ? { ...t, volume } : t
    );
    setTracks(updated);
    if (engine) {
      const target = updated.find((t) => t.id === trackId);
      if (target) engine.updateVocalFX(target, updated);
    }
  };

  const handleChangeTrackPan = (trackId: VocalTrackId, pan: number) => {
    const clampedPan = Math.max(-1, Math.min(1, pan));
    const updated = tracks.map((t) =>
      t.id === trackId ? { ...t, pan: clampedPan } : t
    );
    setTracks(updated);
    tracksRef.current = updated;
    if (engine) {
      const target = updated.find((t) => t.id === trackId);
      if (target) engine.updateVocalFX(target, updated);
    }
  };

  const handleAddBackingTrack = () => {
    const hasBacking1 = tracks.some((t) => t.id === 'backing1');
    const hasBacking2 = tracks.some((t) => t.id === 'backing2');
    if (hasBacking1 && hasBacking2) {
      showToast('Ya has alcanzado el límite de 2 pistas de apoyo adicionales.', 'info');
      return;
    }

    pushUndoSnapshot('Agregar pista adicional');

    const newId: VocalTrackId = !hasBacking1 ? 'backing1' : 'backing2';
    const newName = !hasBacking1 ? 'Coro 1 (Apoyo)' : 'Coro 2 (Apoyo)';
    const defaultPan = !hasBacking1 ? -0.45 : 0.45;

    const newTrack: VocalTrack = {
      id: newId,
      name: newName,
      buffer: null,
      duration: 0,
      startBeatOffset: 0,
      volume: 0.85,
      pan: defaultPan,
      isMuted: false,
      isSolo: false,
      isCustom: true,
      fx: {
        ...defaultVocalFX(),
        reverb: { preset: 'PLATE', mix: 0.25 },
        comp: { amount: 0.4 },
      },
    };

    const nextTracks = [...tracks, newTrack];
    setTracks(nextTracks);
    tracksRef.current = nextTracks;
    showToast(`¡Pista "${newName}" agregada con éxito!`, 'success');
  };

  const handleDeleteCustomTrack = (trackId: VocalTrackId) => {
    pushUndoSnapshot('Eliminar pista adicional');
    const nextTracks = tracks.filter((t) => t.id !== trackId);
    setTracks(nextTracks);
    tracksRef.current = nextTracks;
    if (selectedTrackId === trackId) {
      setSelectedTrackId('lead1');
    }
    showToast('Pista adicional eliminada.', 'info');
  };

  const canAddMoreTracks = tracks.filter((t) => t.id === 'backing1' || t.id === 'backing2').length < 2;

  const handleDeleteTake = (trackId: VocalTrackId, clipId?: string) => {
    pushUndoSnapshot('Eliminar toma');
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;

      if (clipId && t.clips && t.clips.length > 0) {
        const remaining = t.clips.filter((c) => c.id !== clipId);
        if (remaining.length > 0) {
          const maxDur = Math.max(...remaining.map((c) => c.startBeatOffset + c.duration));
          const last = remaining[remaining.length - 1];
          return {
            ...t,
            clips: remaining,
            buffer: last.buffer,
            duration: maxDur,
            startBeatOffset: last.startBeatOffset,
            waveformSample: last.waveformSample,
            tunedBuffer: last.tunedBuffer,
          };
        }
      }

      return {
        ...t,
        clips: [],
        buffer: null,
        duration: 0,
        startBeatOffset: 0,
        waveformSample: undefined,
        tunedBuffer: null,
      };
    });

    setTracks(updated);
    tracksRef.current = updated;
    const targetName = tracks.find((t) => t.id === trackId)?.name || trackId;
    showToast(`Toma eliminada en ${targetName}`, 'info');
  };

  // Update Vocal FX (including Pitch Tune)
  const handleChangeVocalFX = async (newFX: VocalFX) => {
    if (!activeFXTrackId) return;
    const updated = tracks.map((t) =>
      t.id === activeFXTrackId ? { ...t, fx: newFX, tunedBuffer: null } : t
    );
    setTracks(updated);
    tracksRef.current = updated;

    if (engine) {
      const target = updated.find((t) => t.id === activeFXTrackId);
      if (target) {
        engine.updateVocalFX(target, updated);

        // Process vocal pitch tune if speed > 0
        if (target.fx.tune?.enabled && target.fx.tune.speed > 0.01 && target.buffer) {
          const tuned = await engine.updateTuneForTrack(target);
          if (tuned) {
            target.tunedBuffer = tuned;
            setTracks([...updated]);
            tracksRef.current = [...updated];
          }
        }
      }
    }
  };

  // Toggle Lock Beat status (Prevents beat from ever changing accidentally)
  const handleToggleLockBeat = () => {
    const nextLocked = !isBeatLocked;
    setIsBeatLocked(nextLocked);
    if (currentBeat) {
      saveActiveBeatId(currentBeat.id, nextLocked);
    }
    showToast(
      nextLocked
        ? '🔒 Beat fijado: no se cambiará accidentalmente al grabar o navegar'
        : '🔓 Beat libre: ahora puedes cambiar de beat',
      nextLocked ? 'success' : 'info'
    );
  };

  // Beat Cycle / Switching
  const handleCycleBeat = (dir: 1 | -1) => {
    showToast('Abre "Beats" para seleccionar o subir otro beat.', 'info');
  };

  // Explicitly select beat from library or demo list
  const handleSelectBeat = (beat: BeatData) => {
    currentBeatRef.current = beat;
    setCurrentBeat(beat);
    if (engine) engine.setBeat(beat);
    saveActiveBeatId(beat.id, true);
    showToast(`Beat seleccionado: "${beat.title}"`, 'info');
  };

  // Handle uploaded beat with persistent storage and auto-lock
  const handleUploadBeat = async (
    uploadedBeat: BeatData,
    detectedAnalysis?: BeatAnalysisResult,
    rawBuffer?: ArrayBuffer
  ) => {
    if (savedCustomBeats.length >= MAX_SAVED_BEATS) {
      showToast(`Capacidad máxima de ${MAX_SAVED_BEATS} beats alcanzada. Elimina uno para liberar espacio.`, 'error');
      return;
    }

    // 1. Mark as locked by default so it stays protected
    uploadedBeat.isLocked = true;
    setIsBeatLocked(true);

    // 2. Set ref and current state immediately
    currentBeatRef.current = uploadedBeat;
    setCurrentBeat(uploadedBeat);
    if (engine) engine.setBeat(uploadedBeat);

    // 3. Persist to browser's IndexedDB and localStorage so it survives refreshes
    await saveBeatToDatabase(uploadedBeat, rawBuffer, true);
    await saveActiveBeatId(uploadedBeat.id, true);

    // 4. Update state preserving slot sequence up to 23
    const nextSaved = [...savedCustomBeats.filter((b) => b.id !== uploadedBeat.id), uploadedBeat].slice(0, MAX_SAVED_BEATS);
    setSavedCustomBeats(nextSaved);

    const slotNumber = nextSaved.findIndex((b) => b.id === uploadedBeat.id) + 1;

    if (detectedAnalysis) {
      showToast(
        `⚡ ¡Beat asignado a Slot #${slotNumber} de ${MAX_SAVED_BEATS}!: ${detectedAnalysis.bpm} BPM • ${detectedAnalysis.tonalityName}`,
        'success'
      );
      const newTracks = tracks.map((t) => ({
        ...t,
        fx: {
          ...t.fx,
          tune: {
            ...(t.fx.tune || defaultVocalFX().tune),
            rootKey: detectedAnalysis.rootKey,
            scaleMode: detectedAnalysis.scaleMode,
            tonalityId: detectedAnalysis.matchingPopularTonality,
          },
        },
        tunedBuffer: null,
      }));
      setTracks(newTracks);
      tracksRef.current = newTracks;
    } else {
      showToast(`¡Beat "${uploadedBeat.title}" guardado en el Slot #${slotNumber} de ${MAX_SAVED_BEATS}!`, 'success');
    }
  };

  // Delete saved beat from IndexedDB
  const handleDeleteSavedBeat = async (beatId: string) => {
    const targetSlot = savedCustomBeats.findIndex((b) => b.id === beatId) + 1;
    await deleteSavedBeat(beatId);
    const nextSaved = savedCustomBeats.filter((b) => b.id !== beatId);
    setSavedCustomBeats(nextSaved);

    if (currentBeat?.id === beatId) {
      const fallback = nextSaved[0] || demoBeats[0];
      if (fallback) {
        setCurrentBeat(fallback);
        if (engine) engine.setBeat(fallback);
        saveActiveBeatId(fallback.id, false);
        setIsBeatLocked(false);
      }
    }
    showToast(`Slot #${targetSlot || 1} liberado (${nextSaved.length}/${MAX_SAVED_BEATS} beats ocupados)`, 'info');
  };

  // Export Modal trigger
  const handleExport = () => {
    if (!engine || !currentBeat) {
      showToast('Carga un beat antes de exportar.', 'error');
      return;
    }
    setShowExportModal(true);
  };

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  const activeFXTrack = tracks.find((t) => t.id === activeFXTrackId) || null;
  const hasRecordings = tracks.some((t) => t.buffer !== null);
  const currentBeatSlotIndex = currentBeat?.isCustomUpload
    ? Math.max(1, savedCustomBeats.findIndex((b) => b.id === currentBeat.id) + 1)
    : 1;

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col justify-between selection:bg-amber-500/30 selection:text-amber-200">
      {/* 1-Bar Count In Metronome Visual Overlay */}
      <CountInOverlay beatNumber={countInBeat} />

      {/* Top Bar Header */}
      <TopBar
        onOpenLoadBeat={() => setShowLoadBeatModal(true)}
        onExport={handleExport}
        isExporting={isExporting}
        countInEnabled={countInEnabled}
        onToggleCountIn={() => setCountInEnabled(!countInEnabled)}
        hasRecordings={hasRecordings}
        isRecording={isRecording}
        activeView={activeView}
        onChangeView={setActiveView}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        undoCount={undoStack.length}
        redoCount={redoStack.length}
        currentBeatTitle={currentBeat?.title}
        currentBeatBpm={currentBeat?.bpm}
      />

      {/* View Switcher Pill Bar */}
      <div className="w-full max-w-md mx-auto px-4 pt-3 flex items-center justify-center gap-2">
        <button
          onClick={() => setActiveView('studio')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all ${
            activeView === 'studio'
              ? 'bg-zinc-800 text-amber-300 border border-amber-500/40 shadow-lg'
              : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
          }`}
        >
          <Disc3 className="w-4 h-4" />
          <span>REPRODUCTOR & MIC</span>
        </button>

        <button
          onClick={() => setActiveView('editor')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all relative ${
            activeView === 'editor'
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-extrabold'
              : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>ESPACIO DE EDICIÓN</span>
          {hasRecordings && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* Main Studio Viewport Canvas */}
      <main className="flex-1 flex flex-col items-center w-full mx-auto pb-8 pt-1">
        {activeView === 'studio' ? (
          <div className="w-full max-w-xl flex flex-col items-center">
            {/* Physical Beat Dock Shelf - Tangible visual anchor for the user's beat */}
            {currentBeat && (
              <div className="w-full flex items-center justify-between px-3.5 py-2 mb-2 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-xs font-mono shadow-md backdrop-blur-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                        Espacio Físico Beat
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
                        RANURA {currentBeatSlotIndex}/23
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold hidden sm:inline">
                        GUARDADO ({savedCustomBeats.length}/23)
                      </span>
                    </div>
                    <div className="text-zinc-100 font-bold text-xs truncate max-w-[180px] sm:max-w-[280px]">
                      {currentBeat.title}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-amber-400 font-bold text-[11px] bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                    {currentBeat.bpm} BPM
                  </span>
                  <button
                    onClick={() => setShowLoadBeatModal(true)}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 font-medium transition-colors active:scale-95"
                    title="Administrar las 23 ranuras físicas de beats"
                  >
                    23 Ranuras
                  </button>
                </div>
              </div>
            )}

            {/* Core Artwork & Transport Player */}
            <ArtworkPlayer
              beat={currentBeat}
              isPlaying={isPlaying}
              currentTime={currentTime}
              loopSettings={loopSettings}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onToggleLoop={handleToggleLoop}
              onOpenLoopSettings={() => setShowLoopModal(true)}
              onOpenBeatFX={() => setShowBeatFXModal(true)}
              beatVolume={beatFX.volume}
              onChangeBeatVolume={(vol) => setBeatFX({ ...beatFX, volume: vol })}
              onDetectKeyAndBpm={handleDetectCurrentBeat}
              isAnalyzingBeat={isAnalyzingBeat}
              onChangeBpm={(newBpm) => {
                if (currentBeat) {
                  const updated = { ...currentBeat, bpm: newBpm };
                  setCurrentBeat(updated);
                  currentBeatRef.current = updated;
                  if (engine) engine.updateBeatBpm(newBpm);
                }
              }}
            />

            {/* Dedicated Main Record Control Bar */}
            <RecordControlBar
              selectedTrack={selectedTrack}
              isRecording={isRecording}
              recordingTrackId={activeRecordingTrackId}
              countInEnabled={countInEnabled}
              onToggleCountIn={() => setCountInEnabled(!countInEnabled)}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}
              onGenerateTestTake={handleGenerateTestTake}
              getMicLevel={() => (engine ? engine.getMicInputLevel() : 0)}
              getMicStatus={() => (engine ? engine.getMicInputStatus() : { level: 0, isSaturated: false, gainReductionDb: 0 })}
            />

            {/* Vocal Tracks Mixer & Recorders (Lead 1, Lead 2, Double, Harmony 1, Harmony 2, Adlibs, Backings) */}
            <VocalTracksList
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              onSelectTrack={setSelectedTrackId}
              activeRecordingTrackId={activeRecordingTrackId}
              isRecording={isRecording}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              onChangeVolume={handleChangeTrackVolume}
              onChangePan={handleChangeTrackPan}
              onAddBackingTrack={handleAddBackingTrack}
              canAddMoreTracks={canAddMoreTracks}
              onDeleteTrack={handleDeleteCustomTrack}
              onDeleteTake={handleDeleteTake}
              onOpenFX={(trackId) => setActiveFXTrackId(trackId)}
            />
          </div>
        ) : (
          /* Dedicated Editing Workspace (Timeline with Beat + Vocal Tracks, moveable clips, micro-latency nudge, 2 leads) */
          <div className="w-full max-w-4xl flex flex-col items-center">
            {/* Direct Quick Record Bar also available in Editor Mode */}
            <RecordControlBar
              selectedTrack={selectedTrack}
              isRecording={isRecording}
              recordingTrackId={activeRecordingTrackId}
              countInEnabled={countInEnabled}
              onToggleCountIn={() => setCountInEnabled(!countInEnabled)}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}
              onGenerateTestTake={handleGenerateTestTake}
              getMicLevel={() => (engine ? engine.getMicInputLevel() : 0)}
              getMicStatus={() => (engine ? engine.getMicInputStatus() : { level: 0, isSaturated: false, gainReductionDb: 0 })}
            />

            <TimelineWorkspace
              beat={currentBeat}
              tracks={tracks}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onSeek={handleSeek}
              onMoveTake={handleMoveTake}
              onStartDragMove={handleStartDragMove}
              onCommitDragMove={handleCommitDragMove}
              onDuplicateTake={handleDuplicateTake}
              onDeleteTake={handleDeleteTake}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              onChangePan={handleChangeTrackPan}
              onAddBackingTrack={handleAddBackingTrack}
              canAddMoreTracks={canAddMoreTracks}
              onDeleteTrack={handleDeleteCustomTrack}
              onOpenFX={(trackId) => setActiveFXTrackId(trackId)}
              selectedTrackId={selectedTrackId}
              onSelectTrack={setSelectedTrackId}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              undoCount={undoStack.length}
              redoCount={redoStack.length}
              onOpenLoadBeat={() => setShowLoadBeatModal(true)}
              currentBeatSlotIndex={currentBeatSlotIndex}
              totalSavedBeatsCount={savedCustomBeats.length}
              loopSettings={loopSettings}
              onOpenLoopModal={() => setShowLoopModal(true)}
            />
          </div>
        )}
      </main>

      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900/95 text-white border border-zinc-700 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-200 text-xs font-mono max-w-[90vw]">
          {toastMessage.type === 'error' && (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          {toastMessage.type === 'success' && (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          {toastMessage.type === 'info' && (
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="truncate">{toastMessage.text}</span>
        </div>
      )}

      {/* Vocal FX Bottom Sheet / Modal (with Auto-Tune & 5 Tonalities) */}
      {activeFXTrackId && (
        <VocalFXModal
          track={activeFXTrack}
          bpm={currentBeat?.bpm || 140}
          beatKey={currentBeat?.key}
          onClose={() => setActiveFXTrackId(null)}
          onChangeFX={handleChangeVocalFX}
          onChangePan={(pan) => activeFXTrackId && handleChangeTrackPan(activeFXTrackId, pan)}
          audioCtx={engine ? engine.getAudioContext() : null}
        />
      )}

      {/* Beat FX Modal */}
      {showBeatFXModal && (
        <BeatFXModal
          fx={beatFX}
          onClose={() => setShowBeatFXModal(false)}
          onChangeFX={setBeatFX}
          onReset={() =>
            setBeatFX({
              lowPass: 20000,
              highPass: 20,
              volume: 1.0,
            })
          }
        />
      )}

      {/* Loop Settings Modal */}
      {showLoopModal && (
        <LoopModal
          loopSettings={loopSettings}
          bpm={currentBeat?.bpm || 140}
          duration={currentBeat?.duration || 0}
          onClose={() => setShowLoopModal(false)}
          onChangeLoop={setLoopSettings}
        />
      )}

      {/* Load Beat & Audio File Upload Modal with Auto BPM & Key Detection */}
      {showLoadBeatModal && (
        <LoadBeatModal
          currentBeat={currentBeat}
          demoBeats={demoBeats}
          savedCustomBeats={savedCustomBeats}
          onSelectBeat={handleSelectBeat}
          onUploadBeat={handleUploadBeat}
          onDeleteSavedBeat={handleDeleteSavedBeat}
          onClose={() => setShowLoadBeatModal(false)}
          audioCtx={engine ? engine.getAudioContext() : null}
        />
      )}

      {/* Professional Export Modal (Master Mix with 3dB Sidechain & Raw Vocal Stems) */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        engine={engine}
        beat={currentBeat}
        tracks={tracks}
        onShowToast={showToast}
        isDemo={accessStatus.isDemo}
        onOpenUnlockModal={() => {
          setShowExportModal(false);
          setUnlockModalReason('export');
          setIsUnlockModalOpen(true);
        }}
      />

      <UnlockPassModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        reason={unlockModalReason}
        userEmail={accessStatus.email}
      />
    </div>
  );
}

export { App as StudioApp };
