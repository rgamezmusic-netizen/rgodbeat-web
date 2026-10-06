"use client";
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BeatAnalysisResult,
  BeatData,
  BeatFX,
  LoopSettings,
  MusicalKey,
  PopularTonalityId,
  ScaleMode,
  VocalClip,
  VocalFX,
  VocalTrack,
  VocalTrackId,
} from '@/lib/studio/types/audio';
import { AudioEngine } from '@/lib/studio/audio/audioEngine';
import { createDemoBeat } from '@/lib/studio/audio/demoBeats';
import { analyzeBeatAudio } from '@/lib/studio/audio/beatAnalyzer';
import { punchInClips } from '@/lib/studio/audio/wavEncoder';
import { getTrackClips, splitClip, trimClip, withTrackClips } from '@/lib/studio/audio/clipEditing';
import { MAIN_SCALES } from '@/lib/studio/audio/pitchCorrection';
import {
  saveBeatToDatabase,
  getAllSavedBeats,
  deleteSavedBeat,
  saveActiveBeatId,
  getActiveBeatSettings,
  MAX_SAVED_BEATS,
} from '@/lib/studio/audio/beatStorage';
import {
  saveStudioSession as persistStudioSession,
  restoreLastStudioSession,
  clearSavedStudioSession,
  exportProjectToDeviceFile,
  importProjectFromDeviceFile,
  setSessionStorageUser,
  getSessionStorageKey,
  moveStudioSession,
} from '@/lib/studio/audio/sessionStorage';
import { signOutClient } from '@/lib/auth/client';
import { fetchAuth } from '@/lib/auth/request';
import { TopBar } from './TopBar';
import { ArtworkPlayer } from './ArtworkPlayer';
import { VocalTrackDropdown } from './VocalTrackDropdown';
import { TimelineWorkspace } from './TimelineWorkspace';
import { VocalFXModal } from './VocalFXModal';
import { BeatFXModal } from './BeatFXModal';
import { LoopModal } from './LoopModal';
import { LoadBeatModal } from './LoadBeatModal';
import { ExportModal } from './ExportModal';
import { getCatalogBeatId } from '@/lib/studio/audio/catalogBeat';
import { UnlockPassModal } from './UnlockPassModal';
import { CountInOverlay } from './CountInOverlay';
import { InstallAppModal } from './InstallAppModal';
import { StartupProjectModal } from './StartupProjectModal';
import { SignatureCollageBackdrop } from './SignatureCollageBackdrop';
import {
  saveUserChannelFXTemplate,
  applyUserFXTemplatesToTracks,
  adaptTracksTonalityToBeat,
} from '@/lib/studio/audio/userFXTemplates';
import { AlertCircle, CheckCircle, Info, AlertTriangle, Cloud, Download } from 'lucide-react';
import {
  saveProjectToCloud as persistCloudProject,
  loadProjectFromCloud,
  checkCloudProject,
  CloudProjectCheckResult,
  deleteProjectFromCloud,
  setCloudProjectUser,
} from '@/lib/studio/cloudProject';

import { appendRecordingCheckpoint, recoverRecordingCheckpoints, retireRecordingCheckpoints } from '@/lib/studio/audio/recordingRecovery';

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

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const isRecordingRef = useRef<boolean>(false);
  const recordingPreparationRef = useRef(0);

  const [activeRecordingTrackId, setActiveRecordingTrackId] = useState<VocalTrackId | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<VocalTrackId>('lead1');
  const [countInBeat, setCountInBeat] = useState<number>(0);
  const [countInEnabled, setCountInEnabled] = useState<boolean>(true);
  const [isAnalyzingBeat, setIsAnalyzingBeat] = useState<boolean>(false);

  // View state: 'studio' (Player & Strips) | 'editor' (Timeline Multitrack with moveable takes)
  const [activeView, setActiveView] = useState<'studio' | 'editor'>('studio');
  const activeViewRef = useRef<'studio' | 'editor'>('studio');

  // Vocal Tracks with 2 Leads (Applying user's saved channel FX templates)
  const [tracks, setTracks] = useState<VocalTrack[]>(() => applyUserFXTemplatesToTracks(initialTracks, null));
  const tracksRef = useRef<VocalTrack[]>(tracks);

  // Startup Project Prompt state (Continuar Último Proyecto vs Iniciar Proyecto Nuevo)
  const [showStartupModal, setShowStartupModal] = useState<boolean>(false);
  const [isStartupResolved, setIsStartupResolved] = useState<boolean>(false);
  const startupResolvedRef = useRef(false);
  useEffect(() => { startupResolvedRef.current = isStartupResolved; }, [isStartupResolved]);
  const [pendingStartupSession, setPendingStartupSession] = useState<{
    tracks: VocalTrack[];
    beat?: BeatData | null;
    beatId?: string | null;
    loopSettings?: LoopSettings;
    beatFX?: BeatFX;
    isBeatMuted?: boolean;
    currentTime?: number;
    activeView?: 'studio' | 'editor';
    takesCount: number;
    beatTitle: string;
    savedTimeText?: string;
  } | null>(null);

  // Screen Wake Lock API: Keeps the screen awake while using Studio
  useEffect(() => {
    let wakeLockSentinel: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && navigator.wakeLock?.request) {
          wakeLockSentinel = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.debug('Screen WakeLock active/prevented:', err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, []);

  // Fixed latency presets; actual Bluetooth delay depends on the device.
  const [bluetoothSyncEnabled, setBluetoothSyncEnabled] = useState<boolean>(false);
  const [bluetoothOffsetMs] = useState<number>(185);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);

  // Offer installation once, after project selection, without covering another modal.
  useEffect(() => {
    if (!isStartupResolved || showStartupModal) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone || document.referrer.includes('android-app://');
    if (standalone || localStorage.getItem('rgodbeat_install_prompt_seen')) return;
    const timer = setTimeout(() => {
      localStorage.setItem('rgodbeat_install_prompt_seen', 'true');
      setShowInstallModal(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [isStartupResolved, showStartupModal]);

  const handleToggleBluetoothSync = () => {
    if (isRecordingRef.current) return;
    const nextState = !bluetoothSyncEnabled;
    setBluetoothSyncEnabled(nextState);
    if (engine) {
      engine.setLatencyCompensation(nextState ? -bluetoothOffsetMs : -25);
    }
    showToast(
      nextState
        ? `Compensación Bluetooth: -${bluetoothOffsetMs}ms. Es un ajuste fijo; el retraso puede variar según tus audífonos.`
        : '🎧 Modo normal (Cable / Altavoz). Compensación estándar activa (-25ms).',
      'info'
    );
  };

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
    if (Math.abs(currentOffset - initialOffset) >= 0.0005) {
      const snapshot = preDragTracksSnapshotRef.current;
      setUndoStack((prev) => [
        ...prev.slice(-25),
        { tracks: snapshot, description: 'Mover toma' },
      ]);
      setRedoStack([]); // Reset redo stack on new action
    }
    preDragTracksSnapshotRef.current = null;
  };

  const handleUndo = () => {
    if (isRecordingRef.current) return;
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
    if (engine?.getIsPlaying()) {
      engine.seek(engine.getCurrentPlaybackPosition(), lastEntry.tracks);
    }
    showToast(`Deshecho: ${lastEntry.description}`, 'info');
  };

  const handleRedo = () => {
    if (isRecordingRef.current) return;
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
    if (engine?.getIsPlaying()) {
      engine.seek(engine.getCurrentPlaybackPosition(), nextEntry.tracks);
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
  const [isBeatMuted, setIsBeatMuted] = useState<boolean>(false);
  const [isRecArmed, setIsRecArmed] = useState<boolean>(true);

  const beatMixRef = useRef({ beatFX, isBeatMuted });
  useEffect(() => { beatMixRef.current = { beatFX, isBeatMuted }; }, [beatFX, isBeatMuted]);
  const sessionOwnerRef = useRef<string | null | undefined>(undefined);
  const activeProjectIdRef = useRef(crypto.randomUUID());
  const replacingProjectRef = useRef(false);
  const cloudDirtyRef = useRef(false);
  const cloudConflictRef = useRef(false);
  const cloudVerificationPendingRef = useRef(false);
  const cloudCheckRequestRef = useRef<Promise<boolean> | null>(null);
  const [cloudNeedsCheck, setCloudNeedsCheck] = useState(false);
  const [isCheckingCloud, setIsCheckingCloud] = useState(false);
  const [cloudBackupNotice, setCloudBackupNotice] = useState('');
  const workspaceChangeRef = useRef(0);
  const localSaveRequestRef = useRef(0);
  const cloudSaveRequestRef = useRef(0);
  const [localBackupStatus, setLocalBackupStatus] = useState('Preparando respaldo…');
  const [cloudBackupStatus, setCloudBackupStatus] = useState('');
  const [startupError, setStartupError] = useState<string | null>(null);
  const pauseCloudVerification = useCallback((message?: string) => {
    cloudVerificationPendingRef.current = true;
    setCloudNeedsCheck(true);
    setCloudBackupStatus('Cuenta: conexión pendiente');
    setCloudBackupNotice(message || 'No se pudo conectar con tu respaldo de cuenta. Puedes seguir trabajando y guardar una copia en este dispositivo.');
  }, []);
  async function saveStudioSession(...args: Parameters<typeof persistStudioSession>) {
    if (sessionOwnerRef.current === undefined || replacingProjectRef.current) return false;
    const request = ++localSaveRequestRef.current;
    const change = workspaceChangeRef.current;
    const owner = sessionOwnerRef.current;
    const projectId = activeProjectIdRef.current;
    setLocalBackupStatus('Guardando cambios…');
    const saved = await persistStudioSession(args[0], args[1], args[2], args[3], args[4], args[5],
      args[6] === undefined ? sessionOwnerRef.current : args[6], args[7] ?? beatMixRef.current, args[8] ?? activeProjectIdRef.current);
    if (request === localSaveRequestRef.current && owner === sessionOwnerRef.current
      && projectId === activeProjectIdRef.current && !replacingProjectRef.current) {
      setLocalBackupStatus(!saved ? 'No se pudo guardar la copia local. Descarga tu proyecto.'
        : change === workspaceChangeRef.current ? 'Copia local guardada' : 'Guardando cambios…');
    }
    return saved;
  }
  // Reconnect without reloading the tab or replacing the open audio workspace.
  const retryCloudBackup = useCallback((): Promise<boolean> => {
    if (cloudCheckRequestRef.current) return cloudCheckRequestRef.current;
    const owner = accessStatusRef.current.email;
    if (!owner || replacingProjectRef.current) return Promise.resolve(false);
    if (!navigator.onLine) {
      pauseCloudVerification('Sin conexión. Puedes seguir trabajando en este dispositivo; la cuenta se comprobará cuando vuelva la conexión.');
      return Promise.resolve(false);
    }
    const projectId = activeProjectIdRef.current;
    setIsCheckingCloud(true);
    const request = (async () => {
      try {
        const remote = await checkCloudProject();
        if (owner !== accessStatusRef.current.email || projectId !== activeProjectIdRef.current
          || replacingProjectRef.current) return false;
        setCloudProjectInfo(remote);
        if (remote.unavailable) { pauseCloudVerification(remote.message); return false; }
        cloudVerificationPendingRef.current = false;
        setCloudNeedsCheck(false);
        if (remote.hasProject) {
          // Its relationship to the local workspace was not verified at startup.
          // Offer it for loading; never overwrite it merely because Wi-Fi returned.
          cloudConflictRef.current = true;
          setCloudBackupStatus('Hay un respaldo de cuenta disponible');
          setCloudBackupNotice('Puedes cargar el respaldo desde Proyectos. Tu trabajo abierto se conserva hasta que elijas cargarlo.');
          return false;
        }
        if (!cloudConflictRef.current) {
          cloudDirtyRef.current = true;
          setCloudBackupNotice('');
          setCloudBackupStatus('Cuenta conectada. Respaldo pendiente');
        }
        return !cloudConflictRef.current;
      } finally { setIsCheckingCloud(false); }
    })();
    cloudCheckRequestRef.current = request;
    void request.finally(() => {
      if (cloudCheckRequestRef.current === request) cloudCheckRequestRef.current = null;
    }).catch(() => {});
    return request;
  }, [pauseCloudVerification]);

  const saveProjectToCloud = useCallback(async (...args: Parameters<typeof persistCloudProject>) => {
    if (replacingProjectRef.current) return { success: false, error: 'Se está cambiando de proyecto.' };
    if (cloudVerificationPendingRef.current) {
      const projectId = activeProjectIdRef.current;
      if (!await retryCloudBackup() || projectId !== activeProjectIdRef.current) {
        return { success: false, error: 'La cuenta aún no está disponible para sincronizar. Tu proyecto local se conserva.' };
      }
      // Edits may have continued while the connection was being checked.
      args = [tracksRef.current, currentBeatRef.current, sessionSettingsRef.current.loopSettings, beatMixRef.current];
    }
    if (replacingProjectRef.current) return { success: false, error: 'Se está cambiando de proyecto.' };
    if (cloudConflictRef.current) return { success: false, conflict: true, error: 'Descarga tu copia local y carga la cuenta para resolver el cambio de otra sesión.' };
    const request = ++cloudSaveRequestRef.current;
    const change = workspaceChangeRef.current;
    const owner = accessStatusRef.current.email;
    const projectId = activeProjectIdRef.current;
    cloudDirtyRef.current = true;
    setCloudBackupStatus('Respaldando en tu cuenta…');
    const result = await persistCloudProject(args[0], args[1], args[2], args[3] ?? beatMixRef.current);
    if (request === cloudSaveRequestRef.current && owner === accessStatusRef.current.email
      && projectId === activeProjectIdRef.current && !replacingProjectRef.current) {
      cloudDirtyRef.current = !result.success || change !== workspaceChangeRef.current || isRecordingRef.current;
      cloudConflictRef.current = Boolean(result.conflict);
      setCloudBackupStatus(result.conflict
        ? 'El proyecto cambió en otra sesión. Descarga tu copia antes de cargar la cuenta.'
        : cloudDirtyRef.current ? 'Respaldo de cuenta pendiente. Tu copia local se conserva.'
        : 'Respaldo de cuenta actualizado');
    }
    return result;
  }, [retryCloudBackup]);
  function restoreBeatMix(mix: { beatFX?: BeatFX; isBeatMuted?: boolean }) {
    if (mix.beatFX) setBeatFX(mix.beatFX);
    else setBeatFX(previous => ({ ...previous, lowPass: 20000, highPass: 20 }));
    setIsBeatMuted(mix.isBeatMuted ?? false);
    beatMixRef.current = { beatFX: mix.beatFX ?? beatMixRef.current.beatFX, isBeatMuted: mix.isBeatMuted ?? false };
  }

  // Notification / Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'info' | 'success' | 'error';
  } | null>(null);
  const [isExporting] = useState<boolean>(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setToastMessage({ text, type });
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastMessage(null);
    }, Math.min(10000, Math.max(4500, text.length * 45)));
  }, []);

  // Studio Access & Subscription state
  const [accessStatus, setAccessStatus] = useState<{
    isDemo: boolean;
    isLoggedIn: boolean;
    hasActivePass: boolean;
    daysRemaining: number;
    expiresAt: string | null;
    email: string | null;
    name: string;
  }>({
    isDemo: true,
    isLoggedIn: false,
    hasActivePass: false,
    daysRemaining: 0,
    expiresAt: null,
    email: null,
    name: 'Artista',
  });
  const accessStatusRef = useRef(accessStatus);
  useEffect(() => {
    accessStatusRef.current = accessStatus;
  }, [accessStatus]);

  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockModalReason, setUnlockModalReason] = useState<'export' | 'tracks' | 'general'>('general');

  const accessRequestRef = useRef<Promise<string | null> | null>(null);
  const allowAccountChangeRef = useRef(false);
  const refreshStudioAccess = useCallback((allowAccountChange = false) => {
    if (allowAccountChange) allowAccountChangeRef.current = true;
    if (accessRequestRef.current) return accessRequestRef.current;
    const request = (async () => {
      const res = await fetchAuth('/api/studio/access', { cache: 'no-store' });
      if (!res.ok) throw new Error('No se pudo verificar tu cuenta. Reintenta para recuperar el proyecto correcto.');
      const data = await res.json();
      const email = data.email?.trim().toLowerCase() || null;
      let localSessionOwner = email;
      if (sessionOwnerRef.current !== undefined && sessionOwnerRef.current !== email) {
        if (!allowAccountChangeRef.current) {
          throw new Error('La cuenta cambió. Descarga tu proyecto y vuelve a abrir Studio.');
        }
        const previousOwner = sessionOwnerRef.current;
        const settings = sessionSettingsRef.current;
        const saved = await persistStudioSession(tracksRef.current, currentBeatRef.current, settings.loopSettings,
          settings.currentTime, settings.beatVolume, activeViewRef.current, previousOwner,
          beatMixRef.current, activeProjectIdRef.current);
        if (!saved) throw new Error('No se pudo proteger tu proyecto actual en este dispositivo. Descárgalo antes de cambiar de cuenta.');
        // When a guest signs in, re-key the existing local session in one
        // IndexedDB transaction instead of storing a second copy of all audio.
        // If the account already has a local project, leave this active project
        // in its guest scope so recording can continue without overwriting it.
        if (previousOwner === null && email) {
          const moved = await moveStudioSession(previousOwner, email);
          if (moved) localSessionOwner = email;
          else {
            localSessionOwner = previousOwner;
            cloudConflictRef.current = true;
            setCloudBackupStatus('Tu proyecto local se conserva. Hay datos guardados para esta cuenta; cárgalos o descarga una copia antes de reemplazarlos.');
          }
        } else {
          localSessionOwner = previousOwner;
          cloudConflictRef.current = true;
          setCloudBackupStatus('Tu proyecto local se conserva bajo la cuenta anterior. Descárgalo antes de cambiarlo.');
        }
      }
      sessionOwnerRef.current = localSessionOwner;
      setSessionStorageUser(localSessionOwner);
      setCloudProjectUser(email);
      // A failed query is not proof that the account has no project.
      cloudVerificationPendingRef.current = Boolean(email);
      setCloudNeedsCheck(Boolean(email));
      if (!email) { setCloudBackupNotice(''); setCloudBackupStatus(''); }
      if (allowAccountChangeRef.current) {
        try {
          const remote = await checkCloudProject();
          if (remote.unavailable) {
            pauseCloudVerification();
          } else {
            cloudVerificationPendingRef.current = false;
            setCloudNeedsCheck(false);
            setCloudBackupNotice('');
          }
          if (remote.hasProject) {
            cloudConflictRef.current = true;
            setCloudBackupStatus('Hay un respaldo en esta cuenta. Cárgalo o conserva tu proyecto local antes de sincronizar.');
          }
        } catch {
          pauseCloudVerification();
        }
      }
      const next = {
        isDemo: data.isDemo, isLoggedIn: Boolean(data.isLoggedIn || email), hasActivePass: data.hasActivePass,
        daysRemaining: data.daysRemaining || 0, expiresAt: data.expiresAt, email, name: data.name || 'Artista',
      };
      accessStatusRef.current = next;
      setAccessStatus(next);
      return email;
    })();
    accessRequestRef.current = request;
    void request.finally(() => {
      if (accessRequestRef.current === request) {
        accessRequestRef.current = null;
        allowAccountChangeRef.current = false;
      }
    }).catch(() => {});
    return request;
  }, [pauseCloudVerification]);

  const handleLogout = useCallback(async () => {
    try {
      // Signing out before recovery is allowed, but initial empty tracks must
      // never replace the account's existing backup.
      if (startupResolvedRef.current) {
        if (engine?.getIsRecording()) await engine.stopRecording();
        const settings = sessionSettingsRef.current;
        if (!await saveStudioSession(tracksRef.current, currentBeatRef.current, settings.loopSettings, settings.currentTime, settings.beatVolume, activeViewRef.current)) {
          showToast('Guarda una copia del proyecto antes de cerrar sesión.', 'error'); return;
        }
        if (accessStatusRef.current.isLoggedIn) await saveProjectToCloud(tracksRef.current, currentBeatRef.current, settings.loopSettings);
      }
      await signOutClient();
      setSessionStorageUser(null);
      setAccessStatus({
        isDemo: true,
        isLoggedIn: false,
        hasActivePass: false,
        daysRemaining: 0,
        expiresAt: null,
        email: null,
        name: 'Artista',
      });
      showToast('Sesión cerrada. Memoria desconectada.', 'info');
      // Reload window so audio context and session re-initialize cleanly for fresh state
      window.location.reload();
    } catch (logoutErr) {
      console.error('Error during logout:', logoutErr);
      showToast('Error al cerrar sesión', 'error');
    }
  }, [engine, showToast, saveProjectToCloud]);

  // Cloud Project State (1 saved project per active account in R2 cloud)
  const [cloudProjectInfo, setCloudProjectInfo] = useState<CloudProjectCheckResult | null>(null);
  const [isSavingCloud, setIsSavingCloud] = useState<boolean>(false);
  const [isSavingDevice, setIsSavingDevice] = useState<boolean>(false);
  const [isSavingAndExiting, setIsSavingAndExiting] = useState<boolean>(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(false);
  const [isOpeningDeviceProject, setIsOpeningDeviceProject] = useState(false);
  const [dismissExpirationBanner, setDismissExpirationBanner] = useState<boolean>(false);

  const refreshCloudProjectStatus = useCallback(async () => {
    try {
      const status = await checkCloudProject();
      setCloudProjectInfo(status);
      if (status.expired) {
        showToast(status.message || 'Tu proyecto en la nube fue eliminado porque tu suscripción expiró.', 'error');
      }
    } catch (err) {
      console.warn('Error checking cloud project:', err);
    }
  }, [showToast]);


  useEffect(() => {
    if (!cloudNeedsCheck || !isStartupResolved) return;
    const retry = () => {
      if (navigator.onLine && !document.hidden) void retryCloudBackup().catch(() => {});
    };
    const timer = setInterval(retry, 15000);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [cloudNeedsCheck, isStartupResolved, retryCloudBackup]);

  // Modals state
  const [activeFXTrackId, setActiveFXTrackId] = useState<VocalTrackId | null>(null);
  const [showBeatFXModal, setShowBeatFXModal] = useState<boolean>(false);
  const [showLoopModal, setShowLoopModal] = useState<boolean>(false);
  const [showLoadBeatModal, setShowLoadBeatModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);

  // Initialize AudioEngine
  const sessionSettingsRef = useRef({ loopSettings, currentTime, beatVolume: beatFX.volume });
  useEffect(() => {
    sessionSettingsRef.current = { loopSettings, currentTime, beatVolume: beatFX.volume };
    currentBeatRef.current = currentBeat;
    activeViewRef.current = activeView;
    isRecordingRef.current = isRecording;
    tracksRef.current = tracks;
  }, [loopSettings, currentTime, beatFX.volume, currentBeat, activeView, isRecording, tracks]);

  useEffect(() => {
    let cancelled = false;
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
      onRecordingCheckpoint: (checkpoint) => {
        const key = getSessionStorageKey(sessionOwnerRef.current);
        const projectId = activeProjectIdRef.current;
        void appendRecordingCheckpoint(key, { ...checkpoint, projectId }).then(saved => {
          if (isRecordingRef.current && key === getSessionStorageKey(sessionOwnerRef.current)
            && projectId === activeProjectIdRef.current) {
            setLocalBackupStatus(saved ? 'Voz en curso protegida en este dispositivo' : 'No hay espacio para proteger la voz. Detén y descarga tu proyecto.');
          }
        });
      },
      onRecordingFinished: (trackId, buffer, waveform, explicitOffset, takeId) => {
        const stillRecording = audioEngine.getIsRecording();
        setIsRecording(stillRecording);
        isRecordingRef.current = stillRecording;
        setActiveRecordingTrackId(audioEngine.getRecordingTrackId());
        setIsPlaying(audioEngine.getIsPlaying());
        pushUndoSnapshot('Grabación de voz');
        const start = Math.max(0, explicitOffset ?? audioEngine.getRecordingStartBeatTime());
        const ctx = audioEngine.getAudioContext();
        if (!ctx) return;
        const clip: VocalClip = {
          id: takeId || `clip-${trackId}-${crypto.randomUUID()}`, buffer, tunedBuffer: null,
          startBeatOffset: start, duration: buffer.duration, waveformSample: waveform,
          name: 'Toma', isLocked: true,
        };
        const updated = tracksRef.current.map(track => track.id === trackId
          ? withTrackClips(track, punchInClips(ctx, getTrackClips(track), clip)) : track);
        tracksRef.current = updated;
        setTracks(updated);
        const name = updated.find(track => track.id === trackId)?.name ?? trackId;
        showToast(`Toma grabada en ${name}.`, 'success');
        {
          const settings = sessionSettingsRef.current;
          const owner = sessionOwnerRef.current;
          const projectId = activeProjectIdRef.current;
          void (async () => {
            const saved = await saveStudioSession(updated, currentBeatRef.current, settings.loopSettings,
              settings.currentTime, settings.beatVolume, activeViewRef.current);
            if (saved) return;
            if (owner !== sessionOwnerRef.current || projectId !== activeProjectIdRef.current || replacingProjectRef.current) return;
            if (accessStatusRef.current.isLoggedIn && !cloudConflictRef.current) {
              const result = await saveProjectToCloud(tracksRef.current, currentBeatRef.current, sessionSettingsRef.current.loopSettings);
              if (result.success) return;
            }
            showToast('La toma quedó en Studio, pero no se pudo respaldar. Descarga el archivo del proyecto antes de cerrar o recargar.', 'error');
          })();
        }
      },
      onRecordingAborted: () => {
        isRecordingRef.current = false;
        setIsRecording(false);
        setActiveRecordingTrackId(null);
        setIsPlaying(audioEngine.getIsPlaying());
        setCountInBeat(0);
      },
      onError: (msg) => {
        isRecordingRef.current = false;
        setIsRecording(false);
        setActiveRecordingTrackId(null);
        setIsPlaying(audioEngine.getIsPlaying());
        setCountInBeat(0);
        showToast(msg, 'error');
      },
    });

    setEngine(audioEngine);

    // Generate demo beats and restore saved custom beats from IndexedDB
    (async () => {
      try {
        const owner = await refreshStudioAccess();
        if (cancelled) return;
        const audioCtx = await audioEngine.ensureAudioContext({ resume: false });
        if (cancelled) return;

        // 0. Detect last active Studio session or cloud project to give user the choice:
        // "Continuar Último Proyecto" vs "Iniciar Proyecto Nuevo"
        let restoredSessionBeatId: string | null = null;
        let hasPreviousSession = false;
        let cloudCheck: CloudProjectCheckResult | null = null;

        let lastSession = await restoreLastStudioSession(audioCtx, owner);
        if (lastSession?.projectId) activeProjectIdRef.current = lastSession.projectId;
        const recovery = lastSession ? await recoverRecordingCheckpoints(getSessionStorageKey(owner), audioCtx, lastSession.tracks, activeProjectIdRef.current)
          : { tracks: initialTracks, recovered: 0 };
        if (recovery.recovered) {
          lastSession = { ...(lastSession || {}), timestamp: Date.now(), tracks: recovery.tracks };
          setLocalBackupStatus('Se rescató una grabación interrumpida');
        }

        if (owner) {
          const projectId = activeProjectIdRef.current;
          const localTimestamp = lastSession?.timestamp;
          const verifyAccount = async (): Promise<CloudProjectCheckResult | null> => {
            const remote = await checkCloudProject();
            if (cancelled || owner !== accessStatusRef.current.email
              || projectId !== activeProjectIdRef.current || replacingProjectRef.current) return null;
            setCloudProjectInfo(remote);
            if (remote.unavailable) { pauseCloudVerification(remote.message); return remote; }
            cloudVerificationPendingRef.current = false;
            setCloudNeedsCheck(false);
            setCloudBackupNotice('');
            if (remote.hasProject && localTimestamp !== undefined && (remote.projectMeta?.savedAt || 0) > localTimestamp + 1000) {
              // A late account response must never replace the open local audio.
              cloudConflictRef.current = true;
              setCloudBackupStatus('Hay una copia más reciente en tu cuenta. Tu proyecto local se conserva.');
            } else if (!cloudConflictRef.current) {
              setCloudBackupStatus('Cuenta conectada');
            }
            return remote;
          };
          if (lastSession) {
            // The verified owner's local project can open while the account reconnects.
            // Pending verification still prevents cloud writes or backup deletion.
            setIsCheckingCloud(true);
            setCloudBackupStatus('Conectando con tu cuenta…');
            const request = verifyAccount().then(remote => Boolean(remote && !remote.unavailable && !cloudConflictRef.current));
            cloudCheckRequestRef.current = request;
            void request.finally(() => {
              if (cloudCheckRequestRef.current === request) {
                cloudCheckRequestRef.current = null;
                if (!cancelled) setIsCheckingCloud(false);
              }
            }).catch(() => {});
          } else {
            cloudCheck = await verifyAccount();
          }
        }
        if (cancelled) return;
        const localTakesCount = (lastSession?.tracks || []).reduce(
          (acc, t) => acc + (t.clips?.length || (t.buffer ? 1 : 0)),
          0
        );

        // Priority 1: If local session has vocal takes, offer local session
        if (lastSession) {
          hasPreviousSession = true;
          const sessionBeat = lastSession!.beat || null;
          if (sessionBeat) {
            restoredSessionBeatId = sessionBeat.id;
            setCurrentBeat(sessionBeat);
            currentBeatRef.current = sessionBeat;
            audioEngine.setBeat(sessionBeat);
          } else if (lastSession!.beatId) {
            restoredSessionBeatId = lastSession!.beatId;
          }

          if (lastSession!.beatVolume !== undefined) {
            setBeatFX((prev) => ({ ...prev, volume: lastSession!.beatVolume! }));
          }

          setPendingStartupSession({
            tracks: lastSession!.tracks || [],
            beat: sessionBeat,
            beatId: sessionBeat?.id || lastSession!.beatId,
            loopSettings: lastSession!.loopSettings,
            beatFX: lastSession!.beatFX,
            isBeatMuted: lastSession!.isBeatMuted,
            currentTime: lastSession!.currentTime,
            activeView: lastSession!.activeView || 'studio',
            takesCount: localTakesCount,
            beatTitle: sessionBeat?.title || 'Último Beat',
            savedTimeText: 'Guardado en tu dispositivo',
          });
          setShowStartupModal(true);
        } else {
          // Use the query already made above. An unavailable account pauses
          // cloud writes while the device workspace and beat library still open.
          try {
            if (cloudCheck?.hasProject) {
              const cloudData = await loadProjectFromCloud(audioCtx);
              if (cancelled) return;
              if (cloudData) {
                const cloudTakes = (cloudData.tracks || []).reduce(
                  (acc, t) => acc + (t.clips?.length || (t.buffer ? 1 : 0)),
                  0
                );
                let cloudBeat: BeatData | null = null;
                const customBuf = cloudData.beatData?.customBeatBuffer;
                if (cloudData.beatData && customBuf) {
                  const b = cloudData.beatData;
                  cloudBeat = {
                    id: b.id || `custom-${Date.now()}`,
                    catalogBeatId: getCatalogBeatId(b.id, b.catalogBeatId),
                    title: b.title || 'Mi Beat Guardado',
                    producer: b.producer || 'Custom Beat',
                    genre: b.genre,
                    bpm: b.bpm || 140,
                    key: b.key || 'C',
                    scale: b.scale || 'Menor',
                    duration: customBuf.duration,
                    buffer: customBuf,
                    artworkGradient: b.artworkGradient || 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
                    isCustomUpload: Boolean(b.isCustomUpload),
                    waveformSample: b.waveformSample,
                    detectedBpm: b.detectedBpm,
                    detectedKey: b.detectedKey,
                    isLocked: true,
                  };
                }

                if (cloudTakes > 0 || cloudBeat) {
                  hasPreviousSession = true;
                  if (cloudBeat) {
                    restoredSessionBeatId = cloudBeat.id;
                    setCurrentBeat(cloudBeat);
                    currentBeatRef.current = cloudBeat;
                    audioEngine.setBeat(cloudBeat);
                  }
                  setPendingStartupSession({
                    tracks: cloudData.tracks || [],
                    beat: cloudBeat,
                    beatId: cloudBeat?.id || cloudData.beatData?.id,
                    loopSettings: cloudData.loopSettings,
                    beatFX: cloudData.beatFX,
                    isBeatMuted: cloudData.isBeatMuted,
                    takesCount: cloudTakes,
                    beatTitle: cloudBeat?.title || cloudData.beatData?.title || 'Proyecto en Cuenta',
                    savedTimeText: cloudCheck.projectMeta?.savedAt ? new Date(cloudCheck.projectMeta.savedAt).toLocaleDateString() : 'En tu cuenta',
                  });
                  setShowStartupModal(true);
                }
              }
            }
          } catch (cloudErr) {
            if (cancelled) return;
            console.warn('Account backup could not be restored at startup:', cloudErr);
            pauseCloudVerification('No se pudo descargar el respaldo de cuenta. Puedes trabajar en este dispositivo y reintentar desde Proyectos.');
          }


        }

        // If no previous session detected at all, mark startup as resolved immediately
        if (!hasPreviousSession) {
          setIsStartupResolved(true);
        }

        // 1. Fetch saved custom beats from persistent IndexedDB
        const storedBeats = await getAllSavedBeats(audioCtx);
        if (cancelled) return;
        setSavedCustomBeats(storedBeats);

        // 2. Fetch saved active beat preference and lock status
        const { activeBeatId, isLocked } = await getActiveBeatSettings();
        const preferredBeatId = restoredSessionBeatId || activeBeatId;

        // 3. Generate initial offline demo beats
        const trapBeat = await createDemoBeat(audioCtx, 'trap');
        const rnbBeat = await createDemoBeat(audioCtx, 'rnb');
        const drillBeat = await createDemoBeat(audioCtx, 'drill');

        const beats = [trapBeat, rnbBeat, drillBeat];
        setDemoBeats(beats);

        // If a startup session exists with a known beat ID, match its title
        if (restoredSessionBeatId) {
          const matchBeat = storedBeats.find((b) => b.id === restoredSessionBeatId) || beats.find((b) => b.id === restoredSessionBeatId);
          if (matchBeat) {
            setPendingStartupSession((prev) => prev ? { ...prev, beat: matchBeat, beatTitle: matchBeat.title } : null);
          }
        }

        // 4. Select initial beat:
        // CRITICAL CHECK: If user already uploaded, selected or restored a beat from previous project,
        // NEVER OVERWRITE IT!
        if (currentBeatRef.current) {
          return;
        }

        let chosenBeat: BeatData = trapBeat;
        let chosenLock = isLocked;

        if (storedBeats.length > 0) {
          const matchedStored = storedBeats.find((b) => b.id === preferredBeatId);
          if (matchedStored) {
            chosenBeat = matchedStored;
          } else {
            chosenBeat = storedBeats[0];
          }
          chosenLock = true; // Custom beats are locked by default so they don't get lost
        } else if (preferredBeatId) {
          const matchedPreset = beats.find((b) => b.id === preferredBeatId);
          if (matchedPreset) chosenBeat = matchedPreset;
        }

        if (currentBeatRef.current) return;

        setCurrentBeat(chosenBeat);
        currentBeatRef.current = chosenBeat;
        setIsBeatLocked(chosenLock);
        audioEngine.setBeat(chosenBeat);

        // Adapt vocal channel tuning scales to the chosen beat
        const tracksWithScale = adaptTracksTonalityToBeat(tracksRef.current, chosenBeat);
        setTracks(tracksWithScale);
        tracksRef.current = tracksWithScale;
      } catch (err) {
        console.error('Initial beat generation/restore error:', err);
        setStartupError(err instanceof Error ? err.message : 'No se pudo recuperar el respaldo. Se conserva sin modificar.');
      }
    })();

    return () => {
      cancelled = true;
      audioEngine.dispose();
    };
  }, [showToast, refreshStudioAccess, pauseCloudVerification, saveProjectToCloud]);

  useEffect(() => {
      if (engine) tracks.forEach(track => engine.updateVocalFX(track, tracks));
  }, [tracks, engine]);

  // Debounce tuning and merge only results for the same raw clip and settings.
  // A completed older job must never restore a deleted clip or overwrite a newer edit.
  const tuneKey = (track: VocalTrack) => JSON.stringify(track.fx.tune);
  const tuneSignature = tracks.map(track => `${track.id}:${tuneKey(track)}:${getTrackClips(track).map(clip => `${clip.id}:${clip.buffer.length}:${clip.buffer.sampleRate}`).join(',')}`).join('|');
  useEffect(() => {
    if (!engine || isRecording) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        for (const track of tracksRef.current) {
          const job = { ...track, clips: getTrackClips(track).map(clip => ({ ...clip })) };
          if (!job.fx.tune.enabled || job.fx.tune.speed <= 0.01 || !job.clips.length) continue;
          await engine.updateTuneForTrack(job, controller.signal);
          if (controller.signal.aborted) return;
          const updated = tracksRef.current.map(current => {
            if (current.id !== job.id || tuneKey(current) !== tuneKey(job)) return current;
            const clips = getTrackClips(current).map(clip => {
              const result = job.clips.find(candidate => candidate.id === clip.id && candidate.buffer === clip.buffer);
              return result ? { ...clip, tunedBuffer: result.tunedBuffer } : clip;
            });
            return withTrackClips(current, clips);
          });
          tracksRef.current = updated;
          setTracks(updated);
        }
        if (engine.getIsPlaying()) engine.seek(engine.getCurrentPlaybackPosition(), tracksRef.current);
      } catch (error) {
        if (!controller.signal.aborted) showToast(`Error al afinar: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tuneSignature, engine, isRecording, showToast]);

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

  useEffect(() => { engine?.setBeatMuted(isBeatMuted); }, [engine, isBeatMuted]);

  // Hardware audio unlock on first user interaction (touch/click) for iOS Safari / Chrome
  useEffect(() => {
    if (!engine) return;
    const handleFirstGesture = () => {
      engine.unlockAudio();
    };
    window.addEventListener('touchstart', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('touchend', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('pointerdown', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('click', handleFirstGesture, { passive: true, once: true });
    return () => {
      window.removeEventListener('touchstart', handleFirstGesture);
      window.removeEventListener('touchend', handleFirstGesture);
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('click', handleFirstGesture);
    };
  }, [engine]);

  // Remember the selected library beat; the workspace autosave below owns backups.
  useEffect(() => {
    if (!isStartupResolved || !currentBeat) return;
    saveActiveBeatId(currentBeat.id, true);
  }, [currentBeat, isStartupResolved]);

  // One debounce for workspace edits. Playback position alone must not rewrite audio every frame.
  useEffect(() => {
    if (!isStartupResolved || replacingProjectRef.current) return;
    ++workspaceChangeRef.current;
    if (accessStatusRef.current.isLoggedIn) cloudDirtyRef.current = true;
    if (isRecording) return;
    const statusTimer = setTimeout(() => setLocalBackupStatus('Guardando cambios…'), 0);
    const timer = setTimeout(async () => {
      const settings = sessionSettingsRef.current;
      const saved = await saveStudioSession(tracksRef.current, currentBeatRef.current, settings.loopSettings, settings.currentTime, settings.beatVolume, activeViewRef.current);
      if (saved && accessStatusRef.current.isLoggedIn) {
        saveProjectToCloud(tracksRef.current, currentBeatRef.current, sessionSettingsRef.current.loopSettings).catch(() => {});
      }
    }, 600);
    return () => { clearTimeout(statusTimer); clearTimeout(timer); };
  }, [tracks, currentBeat, activeView, loopSettings, beatFX, isBeatMuted, isStartupResolved, isRecording, cloudNeedsCheck, saveProjectToCloud]);

  // Local PCM is journaled continuously; publish a recoverable in-progress take periodically.
  useEffect(() => {
    if (!isStartupResolved || !engine) return;
    let syncing = false;
    let disposed = false;
    const sync = async () => {
      if (syncing || disposed || !navigator.onLine || !accessStatusRef.current.isLoggedIn
        || replacingProjectRef.current || cloudConflictRef.current || cloudVerificationPendingRef.current) return;
      syncing = true;
      try {
        const recording = engine.getRecordingCheckpointClip();
        if (!recording && !cloudDirtyRef.current) return;
        const ctx = engine.getAudioContext();
        let snapshot = tracksRef.current;
        if (recording && ctx) snapshot = snapshot.map(track => track.id === recording.trackId
          ? withTrackClips(track, punchInClips(ctx, getTrackClips(track), recording.clip)) : track);
        await saveProjectToCloud(snapshot, currentBeatRef.current, sessionSettingsRef.current.loopSettings);
      } catch (error) {
        console.warn('Periodic studio backup failed:', error);
      } finally { syncing = false; }
    };
    const timer = setInterval(() => void sync(), 20000);
    window.addEventListener('online', sync);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('online', sync); };
  }, [isStartupResolved, engine, saveProjectToCloud]);

  async function clearActiveProjectBackup() {
    if (replacingProjectRef.current) return false;
    if (accessStatusRef.current.isLoggedIn && cloudVerificationPendingRef.current) {
      showToast('Revisa la conexión de tu cuenta antes de reemplazar su respaldo. Tu proyecto abierto se conserva.', 'info');
      return false;
    }
    replacingProjectRef.current = true;
    try {
      if (accessStatusRef.current.isLoggedIn && !await deleteProjectFromCloud()) {
        showToast('No se pudo reemplazar el respaldo de cuenta. Tu proyecto sigue intacto; comprueba la conexión.', 'error'); return false;
      }
      if (!await clearSavedStudioSession(sessionOwnerRef.current)) {
        showToast('No se pudo limpiar la memoria local. Tu proyecto sigue abierto.', 'error'); return false;
      }
      activeProjectIdRef.current = crypto.randomUUID();
      cloudDirtyRef.current = false; cloudConflictRef.current = false;
      setCloudProjectInfo(null); setCloudBackupStatus(''); setLocalBackupStatus('Espacio listo para el nuevo proyecto');
      setPendingStartupSession(null);
      return true;
    } finally { replacingProjectRef.current = false; }
  }

  // Handlers for Startup Choice: Continuar Último Proyecto vs Iniciar Proyecto Nuevo
  const handleContinueLastProject = () => {
    if (!pendingStartupSession) {
      setIsStartupResolved(true);
      setShowStartupModal(false);
      return;
    }

    // Merge default track presets with restored session tracks so all channels exist
    const restoredTracks = pendingStartupSession.tracks;
    const mergedTracks = initialTracks.map((defaultTrack) => {
      const found = restoredTracks.find((t) => t.id === defaultTrack.id);
      return found || defaultTrack;
    });
    const customTracks = restoredTracks.filter(
      (t) => !initialTracks.some((it) => it.id === t.id)
    );
    const finalTracks = [...mergedTracks, ...customTracks];
    restoreBeatMix(pendingStartupSession);

    setTracks(finalTracks);
    tracksRef.current = finalTracks;

    if (pendingStartupSession.beat) {
      setCurrentBeat(pendingStartupSession.beat);
      currentBeatRef.current = pendingStartupSession.beat;
      if (engine) engine.setBeat(pendingStartupSession.beat);
    } else if (pendingStartupSession.beatId) {
      const match = savedCustomBeats.find((b) => b.id === pendingStartupSession.beatId) ||
        demoBeats.find((b) => b.id === pendingStartupSession.beatId);
      if (match) {
        setCurrentBeat(match);
        currentBeatRef.current = match;
        if (engine) engine.setBeat(match);
      }
    }

    if (pendingStartupSession.loopSettings) {
      setLoopSettings(pendingStartupSession.loopSettings);
      if (engine) engine.setLoopSettings(pendingStartupSession.loopSettings);
    }

    if (pendingStartupSession.currentTime) {
      setCurrentTime(pendingStartupSession.currentTime);
      if (engine) engine.seek(pendingStartupSession.currentTime, finalTracks);
    }

    if (pendingStartupSession.activeView) {
      setActiveView(pendingStartupSession.activeView);
      activeViewRef.current = pendingStartupSession.activeView;
    }

    setIsStartupResolved(true);
    setShowStartupModal(false);

    // Lock confirmed project into persistent IndexedDB immediately
    saveStudioSession(
      finalTracks,
      pendingStartupSession.beat || currentBeatRef.current,
      pendingStartupSession.loopSettings,
      pendingStartupSession.currentTime,
      beatFX.volume,
      pendingStartupSession.activeView || activeViewRef.current
    );

    setPendingStartupSession(null);
    showToast('✓ Continuando tu último proyecto con todas tus tomas.', 'success');
  };

  const handleStartNewProjectClean = async () => {
    if (pendingStartupSession?.takesCount && !window.confirm('Nuevo proyecto reemplaza el respaldo activo y borra sus voces. Comprueba que guardaste el archivo .rgodbeat. ¿Deseas continuar?')) return;
    if (!await clearActiveProjectBackup()) return;
    if (engine) {
      engine.stop();
    }
    const cleanTracks = applyUserFXTemplatesToTracks(
      initialTracks.map((t) => ({
        ...t,
        buffer: null,
        clips: [],
        duration: 0,
        startBeatOffset: 0,
        waveformSample: undefined,
        tunedBuffer: null,
      })),
      currentBeatRef.current,
      accessStatus.email
    );
    setTracks(cleanTracks);
    tracksRef.current = cleanTracks;
    setUndoStack([]);
    setRedoStack([]);
    setIsStartupResolved(true);
    setShowStartupModal(false);
    showToast('✨ Proyecto nuevo iniciado: pistas limpias y efectos configurados.', 'info');
  };

  // Phone call interruption & backgrounding protector
  // Handles incoming phone calls, WhatsApp calls, screen lock, and app switching
  // without losing timeline synchronization or recorded takes!
  useEffect(() => {
    const handleInterruption = async (event: Event) => {
      if (document.hidden || event.type === 'pagehide' || event.type === 'beforeunload') {
        // Initial empty tracks are not a workspace until recovery was resolved.
        // Backgrounding during startup must never overwrite the stored project.
        if (!startupResolvedRef.current || replacingProjectRef.current) return;
        // Phone call ringing, screen turned off, or app sent to background
        if (engine && engine.getIsRecording()) {
          // Finalize and save active vocal take cleanly to prevent data corruption or loss
          await engine.stopRecording();
          setIsRecording(false);
        } else if (engine && engine.getIsPlaying()) {
          // Pause cleanly keeping playback position locked
          engine.pause();
          setIsPlaying(false);
        }
        // Persist complete session to IndexedDB
        const settings = sessionSettingsRef.current;
        const saved = await saveStudioSession(tracksRef.current, currentBeatRef.current, settings.loopSettings, settings.currentTime, settings.beatVolume, activeViewRef.current);
        if (saved && accessStatusRef.current.isLoggedIn) void saveProjectToCloud(tracksRef.current, currentBeatRef.current, settings.loopSettings);
      } else {
        // User returned to browser after call or app switch
        if (engine) {
          try {
            await engine.ensureAudioContext();
          } catch {}
        }
      }
    };

    document.addEventListener('visibilitychange', handleInterruption);
    window.addEventListener('pagehide', handleInterruption);
    window.addEventListener('beforeunload', handleInterruption);
    return () => {
      document.removeEventListener('visibilitychange', handleInterruption);
      window.removeEventListener('pagehide', handleInterruption);
      window.removeEventListener('beforeunload', handleInterruption);
    };
  }, [engine, saveProjectToCloud]);

  // Automatic Beat BPM & Key Detection on demand
  const handleDetectCurrentBeat = async () => {
    if (isRecordingRef.current || replacingProjectRef.current || isAnalyzingBeat) return;
    if (!currentBeat || !currentBeat.buffer) {
      showToast('Carga un beat para analizarlo', 'info');
      return;
    }

    try {
      setIsAnalyzingBeat(true);
      showToast('Analizando tempo y tonalidad del beat con motor DSP...', 'info');

      const result = await analyzeBeatAudio(currentBeat.buffer);
      if (currentBeatRef.current?.buffer !== currentBeat.buffer || replacingProjectRef.current) return;
      if (isRecordingRef.current) await handleStopRecord();

      const updatedBeat: BeatData = {
        ...currentBeatRef.current,
        bpm: result.bpm,
        key: result.key,
        scale: result.scaleMode === 'minor' ? 'Menor Natural' : 'Mayor',
        detectedBpm: result.bpm,
        detectedKey: result.key,
        detectedConfidence: result.confidence,
      };

      setCurrentBeat(updatedBeat);
      currentBeatRef.current = updatedBeat;
      if (engine) engine.setBeat(updatedBeat);

      // Auto-sync vocal tune root key & scale mode to all tracks
      const newTracks = tracksRef.current.map((t) => ({
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
      showToast('No se pudo analizar el beat', 'error');
    } finally {
      setIsAnalyzingBeat(false);
    }
  };

  // Manual key and scale change handler - Automatically syncs AutoTune on all tracks
  const handleChangeTonality = (rootKey: MusicalKey, scaleMode: ScaleMode) => {
    if (!currentBeat) return;
    const scaleDef = MAIN_SCALES.find((s) => s.id === scaleMode);
    const scaleName = scaleDef ? scaleDef.name : scaleMode;
    const matchingTonalityId = `${rootKey.toLowerCase().replace('#', 's')}_${scaleMode}` as PopularTonalityId;

    const updatedBeat: BeatData = {
      ...currentBeat,
      key: rootKey,
      scale: scaleName,
      detectedKey: rootKey,
    };

    setCurrentBeat(updatedBeat);
    currentBeatRef.current = updatedBeat;
    if (engine?.getBeat()) Object.assign(engine.getBeat()!, { key: rootKey, scale: scaleName });

    // Auto-sync vocal tune root key & scale mode to all tracks and re-tune active takes
    setTracks((prev) => {
      const next = prev.map((t) => ({
        ...t,
        tunedBuffer: null,
        clips: t.clips?.map(clip => ({ ...clip, tunedBuffer: null })),
        fx: {
          ...t.fx,
          tune: {
            ...(t.fx.tune || defaultVocalFX().tune),
            rootKey,
            scaleMode,
            tonalityId: matchingTonalityId,
          },
        },
      }));
      tracksRef.current = next;

      return next;
    });

    showToast(`Escala actualizada: ${rootKey} ${scaleName} (Aplicada a todas las pistas)`, 'success');
  };

  // Transport Handlers
  const handlePlayPause = async () => {
    if (!engine || !currentBeat) return;
    if (!engine.getBeat() && currentBeat) {
      engine.setBeat(currentBeat);
    }
    await engine.unlockAudio();
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

  const handleSeek = async (timeSec: number) => {
    if (!engine) return;
    if (isRecordingRef.current) {
      await handleStopRecord();
    }
    engine.seek(timeSec, tracksRef.current);
  };

  const handleToggleLoop = () => {
    setLoopSettings((prev) => ({
      ...prev,
      enabled: !prev.enabled,
    }));
  };

  const handleToggleBeatMute = useCallback(() => {
    setIsBeatMuted((prev) => {
      const next = !prev;
      if (engine) {
        engine.setBeatMuted(next);
      }
      showToast(next ? 'Pista del Beat silenciada (Muted)' : 'Pista del Beat activada', 'info');
      return next;
    });
  }, [engine, showToast]);

  const handleToggleRecArmed = async () => {
    const next = !isRecArmed;
    setIsRecArmed(next);
    if (!next) {
      await handleStopRecord();
      engine?.releaseMicrophone();
      showToast('Modo Escucha Hi-Fi activado: Micrófono desconectado para reproducir sin filtros de llamada.', 'info');
    } else {
      showToast('Botón REC reactivado: Listo para grabar nuevas tomas.', 'info');
    }
  };

  // Channel selection with live recording migration:
  // If user taps another track while recording is active, cleanly commit the take on the current track
  // and immediately switch recording to the new track without stopping the beat!
  const handleSelectTrack = async (newTrackId: VocalTrackId) => {
    if (selectedTrackId === newTrackId) return;

    if (isRecordingRef.current && engine) {
      if (accessStatus.isDemo && newTrackId !== 'lead1') {
        setUnlockModalReason('tracks'); setIsUnlockModalOpen(true); return;
      }
      const switched = await engine.switchRecordingTrack(newTrackId, tracksRef.current);
      if (!switched) return;
      setSelectedTrackId(newTrackId);
      setActiveRecordingTrackId(newTrackId);
      showToast(`Grabando en ${tracksRef.current.find(t => t.id === newTrackId)?.name ?? newTrackId}.`, 'info');
      return;
    }

    setSelectedTrackId(newTrackId);
  };

  // Recording workflow
  const handleStartRecord = async (trackId: VocalTrackId) => {
    if (!engine || isRecordingRef.current || !isStartupResolved || startupError || replacingProjectRef.current) return;

    // In Demo Mode: only lead1 can record
    if (accessStatus.isDemo && trackId !== 'lead1') {
      showToast('En Modo Demo solo puedes grabar 1 pista (Lead 1). Activa tu pase para desbloquear las pistas vocales.', 'info');
      setUnlockModalReason('tracks');
      setIsUnlockModalOpen(true);
      return;
    }

    if (!isRecArmed) {
      setIsRecArmed(true);
    }

    // Check if punching in over existing take
    const targetTrack = tracks.find((t) => t.id === trackId);
    if (targetTrack?.buffer || (targetTrack?.clips && targetTrack.clips.length > 0)) {
      showToast(`Pinchando toma en ${targetTrack.name}...`, 'info');
    }

    // In professional DAW punch-in recording:
    // Silence this track's audio output in the audio engine so previous takes don't play into the mic or monitor
    engine.clearTrackSources(trackId);

    setSelectedTrackId(trackId);
    setActiveRecordingTrackId(trackId);
    isRecordingRef.current = true;
    setIsRecording(true);
    const preparation = ++recordingPreparationRef.current;

    // Ask for microphone access immediately from the REC click. Waiting for the
    // IndexedDB safety snapshot first can delay or suppress the browser prompt.
    const microphoneReady = await engine.prepareMicrophone();
    if (preparation !== recordingPreparationRef.current || !isRecordingRef.current) {
      engine.releaseMicrophone();
      return;
    }
    if (!microphoneReady) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setActiveRecordingTrackId(null);
      return;
    }

    // Do not make a full-project IndexedDB rewrite a prerequisite for REC.
    // The current project is already autosaved, and the new take is checkpointed
    // while recording then persisted when it finishes. Re-encoding every old
    // audio buffer here can stall or reject REC on large/account-linked sessions.
    const started = await engine.startRecording(trackId, tracksRef.current, countInEnabled);
    if (started) {
      setIsPlaying(true);
    } else {
      isRecordingRef.current = false;
      setIsRecording(false);
      setActiveRecordingTrackId(null);
    }
  };

  async function handleStopRecord() {
    ++recordingPreparationRef.current;
    if (!engine) return;
    await engine.stopRecording();
  };

  const handleCancelCountIn = useCallback(() => {
    ++recordingPreparationRef.current;
    isRecordingRef.current = false;
    if (engine) {
      engine.abortCountIn();
    }
    setCountInBeat(0);
    setIsRecording(false);
    setActiveRecordingTrackId(null);
    showToast('Conteo cancelado', 'info');
  }, [engine, showToast]);

  useEffect(() => {
    const handleTransportKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, button, a, [contenteditable="true"]') ||
        document.querySelector('[role="dialog"]') || showLoadBeatModal || showExportModal || activeFXTrackId || showBeatFXModal || showStartupModal) return;
      if (event.code === 'Space' && !event.repeat) { event.preventDefault(); void handlePlayPause(); }
    };
    window.addEventListener('keydown', handleTransportKey);
    return () => window.removeEventListener('keydown', handleTransportKey);
  });

  // Move / Edit take position along timeline
  const handleMoveTake = (
    trackId: VocalTrackId,
    newOffsetSec: number,
    clipId?: string,
    recordHistory: boolean = false
  ) => {
    if (isRecordingRef.current) return;
    const selected = tracksRef.current.find(track => track.id === trackId);
    if (selected && getTrackClips(selected).some(clip => (!clipId || clip.id === clipId) && clip.isLocked)) return;
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
    if (recordHistory) {
      saveStudioSession(updated, currentBeatRef.current, loopSettings, currentTime, beatFX.volume, activeViewRef.current);
    }
    if (engine && isPlaying && recordHistory) {
      engine.seek(engine.getCurrentPlaybackPosition(), updated);
    }
  };

  // Duplicate take across tracks (e.g. Lead 1 -> Lead 2)
  const handleDuplicateTake = (
    sourceTrackId: VocalTrackId,
    targetTrackId: VocalTrackId,
    clipId?: string
  ) => {
    if (isRecordingRef.current) return;
    const source = tracksRef.current.find((t) => t.id === sourceTrackId);
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
      isLocked: true,
    };

    const target = tracksRef.current.find((t) => t.id === targetTrackId);
    const updated = tracksRef.current.map((t) => {
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
    saveStudioSession(updated, currentBeatRef.current, loopSettings, currentTime, beatFX.volume, activeViewRef.current);
    if (engine?.getIsPlaying()) engine.seek(engine.getCurrentPlaybackPosition(), updated);
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
        isLocked: true,
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

        // The shared tuning effect applies results only to clips that still exist.
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
    if (isRecordingRef.current) return;
    engine?.clearTrackSources(trackId);
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
    if (isRecordingRef.current) return;
    const target = tracksRef.current.find(track => track.id === trackId);
    if (!target || (clipId && !getTrackClips(target).some(clip => clip.id === clipId))) return;
    pushUndoSnapshot(clipId ? 'Borrar pedazo seleccionado' : 'Eliminar toma');
    const updated = tracksRef.current.map((t) => {
      if (t.id !== trackId) return t;

      if (clipId && t.clips && t.clips.length > 0) {
        const remaining = t.clips.filter((c) => c.id !== clipId);
        if (remaining.length > 0) {
          const maxDur = Math.max(...remaining.map((c) => c.startBeatOffset + c.duration));
          const minStart = Math.min(...remaining.map((c) => c.startBeatOffset));
          const last = remaining[remaining.length - 1];
          return {
            ...t,
            clips: remaining,
            buffer: last.buffer,
            duration: maxDur,
            startBeatOffset: minStart,
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
    if (engine?.getIsPlaying()) engine.seek(engine.getCurrentPlaybackPosition(), updated);
    saveStudioSession(updated, currentBeatRef.current, loopSettings, currentTime, beatFX.volume, activeViewRef.current);
    const targetName = tracks.find((t) => t.id === trackId)?.name || trackId;
    showToast(clipId ? `🗑️ Pedazo seleccionado eliminado en ${targetName}` : `Toma eliminada en ${targetName}`, 'info');
  };

  // Toggle Lock/Hold on a specific vocal take to prevent accidental drag or displacement
  const handleToggleLockTake = (trackId: VocalTrackId, clipId?: string) => {
    let nowLocked = false;
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;

      if (t.clips && t.clips.length > 0) {
        const updatedClips = t.clips.map((c) => {
          if (!clipId || c.id === clipId) {
            nowLocked = !c.isLocked;
            return { ...c, isLocked: !c.isLocked };
          }
          return c;
        });
        return {
          ...t,
          clips: updatedClips,
        };
      }

      if (t.buffer) {
        nowLocked = true;
        return {
          ...t,
          clips: [{
            id: `clip-${t.id}-init`,
            buffer: t.buffer,
            tunedBuffer: t.tunedBuffer,
            startBeatOffset: t.startBeatOffset,
            duration: t.duration,
            waveformSample: t.waveformSample,
            name: 'Toma 1',
            isLocked: true,
          }],
        };
      }

      return t;
    });

    setTracks(updated);
    tracksRef.current = updated;
    saveStudioSession(updated, currentBeatRef.current, loopSettings, currentTime, beatFX.volume, activeViewRef.current);
    showToast(
      nowLocked
        ? '🔒 Seguro activado (Hold): Toma protegida contra desplazamientos accidentales.'
        : '🔓 Seguro desactivado: Ya puedes mover o desplazar la toma libremente.',
      'info'
    );
  };

  const applyClipEdit = (trackId: VocalTrackId, clips: VocalClip[], description: string) => {
    pushUndoSnapshot(description);
    const updated = tracksRef.current.map(track => track.id === trackId ? withTrackClips(track, clips) : track);
    tracksRef.current = updated;
    setTracks(updated);
    if (engine?.getIsPlaying()) engine.seek(engine.getCurrentPlaybackPosition(), updated);
    void saveStudioSession(updated, currentBeatRef.current, loopSettings, currentTime, beatFX.volume, activeViewRef.current);
  };

  const handleSplitTake = async (trackId: VocalTrackId, clipId?: string, splitTimeSec = currentTime) => {
    if (!engine || isRecordingRef.current) return;
    const projectId = activeProjectIdRef.current;
    const ctx = await engine.ensureAudioContext();
    if (isRecordingRef.current || replacingProjectRef.current || activeProjectIdRef.current !== projectId) return;
    const track = tracksRef.current.find(t => t.id === trackId);
    if (!track) return;
    const clips = getTrackClips(track);
    const clip = clipId ? clips.find(c => c.id === clipId)
      : clips.find(c => splitTimeSec > c.startBeatOffset && splitTimeSec < c.startBeatOffset + c.duration);
    const parts = clip ? splitClip(ctx, clip, splitTimeSec) : null;
    if (!clip || !parts) { showToast('Coloca el cabezal dentro de la toma para cortarla.', 'info'); return; }
    applyClipEdit(trackId, clips.flatMap(c => c.id === clip.id ? parts : [c]), 'Cortar toma');
    showToast('Toma dividida. Puedes deshacer el corte.', 'success');
  };

  const handleTrimTake = async (trackId: VocalTrackId, clipId: string, edge: 'start' | 'end') => {
    if (!engine || isRecordingRef.current) return;
    const projectId = activeProjectIdRef.current;
    const ctx = await engine.ensureAudioContext();
    if (isRecordingRef.current || replacingProjectRef.current || activeProjectIdRef.current !== projectId) return;
    const track = tracksRef.current.find(t => t.id === trackId);
    const clips = track ? getTrackClips(track) : [];
    const clip = clips.find(c => c.id === clipId);
    if (!clip || currentTime <= clip.startBeatOffset || currentTime >= clip.startBeatOffset + clip.duration) {
      showToast('Coloca el cabezal dentro de la toma para recortar.', 'info'); return;
    }
    const trimmed = trimClip(ctx, clip, edge === 'start' ? currentTime : clip.startBeatOffset,
      edge === 'end' ? currentTime : clip.startBeatOffset + clip.duration);
    if (!trimmed) return;
    applyClipEdit(trackId, clips.map(c => c.id === clip.id ? trimmed : c), 'Recortar toma');
    showToast('Toma recortada al cabezal. Puedes deshacer.', 'success');
  };

  // Update Vocal FX (including Pitch Tune) and persist channel template
  const handleChangeVocalFX = (newFX: VocalFX) => {
    if (!activeFXTrackId) return;
    saveUserChannelFXTemplate(activeFXTrackId, newFX, accessStatus.email);
    const updated = tracksRef.current.map(track => {
      if (track.id !== activeFXTrackId) return track;
      const tuneChanged = tuneKey(track) !== JSON.stringify(newFX.tune);
      return { ...track, fx: newFX,
        tunedBuffer: tuneChanged ? null : track.tunedBuffer,
        clips: tuneChanged ? track.clips?.map(clip => ({ ...clip, tunedBuffer: null })) : track.clips,
      };
    });
    tracksRef.current = updated;
    setTracks(updated);
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
  const handleSelectBeat = async (beat: BeatData) => {
    if (isRecordingRef.current) await handleStopRecord();
    if (replacingProjectRef.current) return;
    currentBeatRef.current = beat;
    setCurrentBeat(beat);
    if (engine) engine.setBeat(beat);
    saveActiveBeatId(beat.id, true);

    // Adapt only the pitch tune musical scale/key to the new beat, preserving all other FX settings
    const adapted = adaptTracksTonalityToBeat(tracksRef.current, beat);
    setTracks(adapted);
    tracksRef.current = adapted;

    showToast(`Beat seleccionado: "${beat.title}"`, 'info');
  };

  // Handle uploaded beat with persistent storage and auto-lock
  const handleUploadBeat = async (
    uploadedBeat: BeatData,
    detectedAnalysis?: BeatAnalysisResult,
    rawBuffer?: ArrayBuffer
  ) => {
    if (isRecordingRef.current) await handleStopRecord();
    if (replacingProjectRef.current) return;
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

    // Adapt only the pitch tune musical scale/key to the uploaded beat
    const adapted = adaptTracksTonalityToBeat(tracksRef.current, uploadedBeat);
    setTracks(adapted);
    tracksRef.current = adapted;

    // 3. Persist to browser's IndexedDB and localStorage so it survives refreshes
    await saveBeatToDatabase(uploadedBeat, rawBuffer, true);
    await saveActiveBeatId(uploadedBeat.id, true);

    // 4. Update state preserving slot sequence up to 23
    const nextSaved = [...savedCustomBeats.filter((b) => b.id !== uploadedBeat.id), uploadedBeat].slice(0, MAX_SAVED_BEATS);
    setSavedCustomBeats(nextSaved);

    const slotNumber = nextSaved.findIndex((b) => b.id === uploadedBeat.id) + 1;

    if (detectedAnalysis && currentBeatRef.current?.buffer === uploadedBeat.buffer) {
      showToast(
        `⚡ ¡Beat asignado a Slot #${slotNumber} de ${MAX_SAVED_BEATS}!: ${detectedAnalysis.bpm} BPM • ${detectedAnalysis.tonalityName}`,
        'success'
      );
      const newTracks = tracksRef.current.map((t) => ({
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
    if (isRecordingRef.current) return;
    if (!engine || !currentBeat) {
      showToast('Carga un beat antes de exportar.', 'error');
      return;
    }
    setShowExportModal(true);
  };

  // Save Project to User Account Cloud (R2 storage)
  const handleSaveCloudProject = async () => {
    if (isRecordingRef.current) return;
    if (!accessStatus.isLoggedIn) {
      showToast('Inicia sesión para respaldar el proyecto en tu cuenta.', 'info');
      return;
    }

    const hasAnyContent = currentBeat || tracksRef.current.some((t) => t.buffer || (t.clips && t.clips.length > 0));
    if (!hasAnyContent) {
      showToast('Carga un beat o graba una voz antes de guardar tu proyecto.', 'info');
      return;
    }

    setIsSavingCloud(true);
    showToast('Guardando proyecto en tu cuenta (pista + voces + efectos)...', 'info');

    try {
      const res = await saveProjectToCloud(tracksRef.current, currentBeatRef.current, loopSettings);
      if (res.success) {
        showToast('☁️ Proyecto guardado exitosamente en tu cuenta.', 'success');
        await saveStudioSession(tracksRef.current, currentBeatRef.current, loopSettings, currentTime, beatFX.volume, activeViewRef.current);
        await refreshCloudProjectStatus();
      } else {
        if (res.requiresPass) {
          setUnlockModalReason('general');
          setIsUnlockModalOpen(true);
        }
        showToast(res.error || 'Error al guardar proyecto en la nube.', 'error');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Error de conexión al guardar.', 'error');
    } finally {
      setIsSavingCloud(false);
    }
  };

  // Load Saved Project from User Account Cloud
  const handleLoadCloudProject = async () => {
    if (isRecordingRef.current || replacingProjectRef.current) return;
    if (tracksRef.current.some(track => getTrackClips(track).length) && !window.confirm('Cargar la cuenta reemplaza las voces abiertas en este dispositivo. Descarga tu archivo .rgodbeat si quieres conservarlas. ¿Continuar?')) return;
    if (!engine) return;
    replacingProjectRef.current = true;
    engine.stop();
    setIsPlaying(false);
    setIsLoadingCloud(true);
    showToast('Descargando tu proyecto desde la nube...', 'info');

    try {
      const audioCtx = await engine.ensureAudioContext();
      const cloudData = await loadProjectFromCloud(audioCtx);

      if (!cloudData) {
        showToast('No se pudo encontrar o descargar el proyecto de la nube.', 'error');
        return;
      }

      // 1. Restore beat
      let loadedBeat: BeatData | null = null;
      if (cloudData.beatData) {
        const beat = cloudData.beatData;
        if (beat.customBeatBuffer) {
          const fullCustomBeat: BeatData = {
            id: beat.id || `custom-${Date.now()}`,
            title: beat.title || 'Mi Beat Guardado',
            producer: beat.producer || 'Custom Beat',
            genre: beat.genre,
            bpm: beat.bpm || 140,
            key: beat.key || 'C',
            scale: beat.scale || 'Menor',
            duration: beat.customBeatBuffer.duration,
            buffer: beat.customBeatBuffer,
            artworkGradient: beat.artworkGradient || 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
            isCustomUpload: Boolean(beat.isCustomUpload),
            detectedBpm: beat.detectedBpm,
            detectedKey: beat.detectedKey,
            isLocked: true,
          };
          loadedBeat = fullCustomBeat;
        } else if (beat.id) {
          const found = demoBeats.find((b) => b.id === beat.id) || savedCustomBeats.find((b) => b.id === beat.id);
          loadedBeat = found ?? null;
        }
        if (!loadedBeat) throw new Error('El respaldo no incluye el audio del beat y ese beat no está en tu biblioteca. Tu proyecto abierto se conserva.');
      }
      setCurrentBeat(loadedBeat);
      engine.setBeat(loadedBeat);

      // 2. Restore vocal tracks
      activeProjectIdRef.current = crypto.randomUUID();
      currentBeatRef.current = engine.getBeat();
      restoreBeatMix(cloudData);
      setTracks(cloudData.tracks);
      tracksRef.current = cloudData.tracks;
      setUndoStack([]); setRedoStack([]); setPendingStartupSession(null);

      // 3. Restore loop settings
      if (cloudData.loopSettings) {
        setLoopSettings(cloudData.loopSettings);
        engine.setLoopSettings(cloudData.loopSettings);
      }

      // 4. Synchronize immediately to local session storage
      const locallySaved = await persistStudioSession(
        cloudData.tracks,
        currentBeatRef.current,
        cloudData.loopSettings,
        currentTime,
        beatFX.volume,
        activeViewRef.current,
        sessionOwnerRef.current,
        beatMixRef.current,
        activeProjectIdRef.current
      );

      if (!locallySaved) throw new Error('El proyecto se abrió, pero no se pudo proteger en este dispositivo. Descarga una copia.');
      cloudConflictRef.current = false;
      cloudVerificationPendingRef.current = false;
      setCloudNeedsCheck(false);
      setCloudBackupNotice('');
      cloudDirtyRef.current = false;
      setCloudBackupStatus('Respaldo de cuenta cargado');
      setLocalBackupStatus('Copia local guardada');
      await retireRecordingCheckpoints(getSessionStorageKey(sessionOwnerRef.current));
      setIsStartupResolved(true);
      showToast('☁️ Proyecto cargado y sincronizado exitosamente.', 'success');
    } catch (err: unknown) {
      console.error('Error loading cloud project:', err);
      showToast(err instanceof Error ? err.message : 'Error al procesar proyecto de la nube.', 'error');
    } finally {
      replacingProjectRef.current = false;
      setIsLoadingCloud(false);
    }
  };

  // Export active project bundle directly to phone/device file (.rgodbeat)
  const handleExportDeviceProject = async () => {
    if (isRecordingRef.current) return;
    const hasAnyContent = currentBeat || tracksRef.current.some((t) => (t.clips && t.clips.length > 0) || t.buffer);
    if (!hasAnyContent) {
      showToast('Carga un beat o graba una voz antes de guardar tu proyecto.', 'info');
      return;
    }

    setIsSavingDevice(true);
    showToast('💾 Generando archivo de proyecto para tu móvil...', 'info');

    try {
      await saveStudioSession(tracksRef.current, currentBeatRef.current, loopSettings, currentTime, beatFX.volume, activeViewRef.current);
      const result = await exportProjectToDeviceFile(
        tracksRef.current,
        currentBeatRef.current,
        loopSettings,
        currentTime,
        beatFX.volume,
        beatMixRef.current
      );
      if (!result.success) throw new Error(result.error || 'No se pudo guardar el archivo.');
      showToast(`Descarga iniciada: ${result.filename}. Comprueba el archivo antes de abrir un proyecto nuevo.`, 'success');
    } catch (err: unknown) {
      console.error('Error exporting project to device:', err);
      showToast('Error al guardar el archivo en tu dispositivo.', 'error');
    } finally {
      setIsSavingDevice(false);
    }
  };

  // Safe Exit and Auto-Save (returns to main store cleanly)
  const handleSaveAndExit = async () => {
    if (!startupResolvedRef.current || replacingProjectRef.current) {
      showToast('Termina de recuperar o elegir el proyecto antes de guardar y salir.', 'info');
      return;
    }
    try {
      if (engine && isRecordingRef.current) await engine.stopRecording();
      setIsSavingAndExiting(true);
      showToast('💾 Guardando proyecto antes de salir...', 'info');

      if (engine && isPlaying) {
        engine.pause();
        setIsPlaying(false);
      }

      // Always save local session in IndexedDB
      const saved = await saveStudioSession(
        tracksRef.current, currentBeatRef.current, loopSettings, currentTime,
        beatFX.volume, activeViewRef.current
      );
      if (!saved) {
        showToast('No se pudo guardar el proyecto. Descarga una copia antes de salir.', 'error');
        return;
      }

      if (accessStatusRef.current.isLoggedIn) {
        const remote = await saveProjectToCloud(tracksRef.current, currentBeatRef.current, loopSettings);
        if (!remote.success) {
          showToast('Proyecto guardado en este dispositivo. La cuenta sigue pendiente; reintenta la conexión o descarga el archivo antes de salir.', 'info'); return;
        }
      }

      showToast('✅ Proyecto guardado. Hasta pronto.', 'success');

      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (err) {
      console.error('Error in handleSaveAndExit:', err);
      showToast('No se pudo guardar. Tu proyecto sigue abierto.', 'error');
    } finally {
      setIsSavingAndExiting(false);
    }
  };

  // Open Project File (.rgodbeat) from Device (phone or PC)
  const handleImportDeviceProject = async (file: File) => {
    if (isRecordingRef.current || replacingProjectRef.current) return;
    if (sessionOwnerRef.current === undefined || startupError) return;
    if ((pendingStartupSession?.takesCount || tracksRef.current.some(track => getTrackClips(track).length)) && !window.confirm('Abrir este archivo reemplaza el proyecto activo. Comprueba que guardaste el anterior como .rgodbeat. ¿Continuar?')) return;
    if (!engine) return;
    replacingProjectRef.current = true;
    setIsOpeningDeviceProject(true);
    engine.stop();
    setIsPlaying(false);

    try {
      showToast('Abriendo archivo de proyecto desde tu dispositivo...', 'info');
      const audioCtx = await engine.ensureAudioContext();
      const restored = await importProjectFromDeviceFile(file, audioCtx, crypto.randomUUID(), sessionOwnerRef.current,
        [...(currentBeatRef.current ? [currentBeatRef.current] : []), ...savedCustomBeats, ...demoBeats]);

      if (!restored) {
        showToast('No se pudo leer el archivo de proyecto.', 'error');
        return;
      }

      activeProjectIdRef.current = restored.projectId;
      setCurrentBeat(restored.beat);
      currentBeatRef.current = restored.beat;
      engine.setBeat(restored.beat);

      currentBeatRef.current = engine.getBeat();
      restoreBeatMix(restored);
      setTracks(restored.tracks);
      tracksRef.current = restored.tracks;
      setUndoStack([]); setRedoStack([]); setPendingStartupSession(null);

      if (restored.loopSettings) {
        setLoopSettings(restored.loopSettings);
        engine.setLoopSettings(restored.loopSettings);
      }

      if (restored.beatVolume !== undefined) {
        const nextVol = restored.beatVolume;
        setBeatFX((prev) => {
          const updated = { ...prev, volume: nextVol };
          engine.setBeatFX(updated);
          return updated;
        });
      }

      // Close startup modal if open and mark startup as resolved
      setShowStartupModal(false);
      setIsStartupResolved(true);

      showToast('✅ Proyecto cargado con éxito desde tu dispositivo.', 'success');
    } catch (err: unknown) {
      console.error('Error importing project from device:', err);
      showToast(err instanceof Error ? err.message : 'Error al abrir el archivo de proyecto. Formato incompatible o dañado.', 'error');
    } finally {
      replacingProjectRef.current = false;
      setIsOpeningDeviceProject(false);
    }
  };

  // Start a Clean New Project
  const handleNewProject = async () => {
    if (isRecordingRef.current) return;
    const hasTakes = tracks.some((t) => t.buffer || (t.clips && t.clips.length > 0));
    if (hasTakes) {
      const confirmed = window.confirm(
        'Nuevo proyecto reemplaza tu único respaldo activo y elimina las voces anteriores.\n\nComprueba que el archivo .rgodbeat está guardado en tu móvil. ¿Deseas continuar?'
      );
      if (!confirmed) return;
    }

    if (!await clearActiveProjectBackup()) return;
    if (engine) {
      engine.stop();
    }

    const resetTracks = applyUserFXTemplatesToTracks(
      initialTracks.map((t) => ({
        ...t,
        buffer: null,
        clips: [],
        duration: 0,
        startBeatOffset: 0,
        waveformSample: undefined,
        tunedBuffer: null,
      })),
      currentBeatRef.current,
      accessStatus.email
    );

    setTracks(resetTracks);
    tracksRef.current = resetTracks;
    setUndoStack([]);
    setRedoStack([]);

    showToast('✨ Nuevo proyecto iniciado: canales limpios con tus efectos preferidos.', 'info');
    setShowLoadBeatModal(true);
  };

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  const activeFXTrack = tracks.find((t) => t.id === activeFXTrackId) || null;
  const hasRecordings = tracks.some((t) => t.buffer !== null);
  const currentBeatSlotIndex = currentBeat?.isCustomUpload
    ? Math.max(1, savedCustomBeats.findIndex((b) => b.id === currentBeat.id) + 1)
    : 1;

  return (
    <div className={`w-full max-w-[100vw] ${
      activeView === 'editor'
        ? 'bg-[#09090b] text-white h-dvh max-h-dvh overflow-hidden'
        : 'bg-[#fbbf24] text-zinc-950 min-h-screen overflow-x-hidden justify-between'
    } flex flex-col selection:bg-amber-500/30 selection:text-amber-200 transition-colors duration-200`}>
      {/* 1-Bar Count In Metronome Visual Overlay */}
      <CountInOverlay beatNumber={countInBeat} onCancel={handleCancelCountIn} />
      {(isLoadingCloud || isOpeningDeviceProject) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-label="Abriendo proyecto" aria-busy="true">
          <p className="rounded-2xl border border-amber-500/40 bg-zinc-950 p-6 text-white" role="status">
            Abriendo proyecto… Espera a que se carguen el beat y las voces.
          </p>
        </div>
      )}

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
        canUndo={!isRecording && undoStack.length > 0}
        canRedo={!isRecording && redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        undoCount={undoStack.length}
        redoCount={redoStack.length}
        currentBeatTitle={currentBeat?.title}
        currentBeatBpm={currentBeat?.bpm}
        onOpenInstallModal={() => setShowInstallModal(true)}
        accessStatus={accessStatus}
        onOpenUnlockModal={() => {
          setUnlockModalReason('general');
          setIsUnlockModalOpen(true);
        }}
        onLogout={handleLogout}
        onSaveCloudProject={handleSaveCloudProject}
        onLoadCloudProject={handleLoadCloudProject}
        onNewProject={handleNewProject}
        onSaveDeviceProject={handleExportDeviceProject}
        onLoadDeviceProject={handleImportDeviceProject}
        isSavingDevice={isSavingDevice}
        isSavingCloud={isSavingCloud}
        isLoadingCloud={isLoadingCloud}
        hasCloudProject={Boolean(cloudProjectInfo?.hasProject)}
        onSaveAndExit={handleSaveAndExit}
        isSavingAndExiting={isSavingAndExiting}
      />

      {/* Backup status stays separate from a recoverable account connection issue. */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] leading-relaxed text-zinc-300" role="status" aria-live="polite">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          <p>{localBackupStatus}</p>
          {cloudBackupStatus && <p className="text-zinc-400">{cloudBackupStatus}</p>}
        </div>
        {cloudBackupNotice && (
          <div className="mt-1.5 text-amber-200">
            <p>{cloudBackupNotice}</p>
            {cloudNeedsCheck && <button type="button" disabled={isCheckingCloud} className="mt-1 underline underline-offset-2 cursor-pointer disabled:cursor-wait disabled:opacity-60" onClick={() => void retryCloudBackup().catch(() => {})}>{isCheckingCloud ? 'Comprobando conexión…' : 'Reintentar conexión'}</button>}
          </div>
        )}
        <details className="mt-1 text-zinc-500">
          <summary className="cursor-pointer">Cómo se guardan tus proyectos</summary>
          <p className="mt-1 text-zinc-400">Studio conserva un proyecto activo por cuenta. Descarga el archivo .rgodbeat para conservar versiones; «Nuevo proyecto» reemplaza el respaldo activo y sus voces.</p>
        </details>
        {startupError && <p className="mt-1 text-amber-300">{startupError} <button className="underline cursor-pointer" onClick={() => window.location.reload()}>Reintentar</button></p>}
      </div>
      {accessStatus.hasActivePass &&
        accessStatus.daysRemaining <= 3 &&
        !dismissExpirationBanner &&
        !['admin@rgodbeat.com', 'rgamezmusic@gmail.com', 'rgodbeat@gmail.com'].includes(
          accessStatus.email?.toLowerCase() || ''
        ) && (
          <div className="bg-gradient-to-r from-red-950/95 via-amber-950/90 to-red-950/95 border-b border-amber-500/40 px-3 sm:px-6 py-2.5 flex items-center justify-between text-xs text-amber-100 z-20 shadow-lg shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
              <span className="truncate sm:whitespace-normal font-sans">
                <strong>Atención:</strong> Tu suscripción al Studio vence en{' '}
                <span className="text-amber-300 font-bold underline font-mono">
                  {accessStatus.daysRemaining} {accessStatus.daysRemaining === 1 ? 'día' : 'días'}
                </span>
                . Renueva para mantener las funciones premium. Tu respaldo no se borra al vencer el pase.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <button
                onClick={() => {
                  setUnlockModalReason('general');
                  setIsUnlockModalOpen(true);
                }}
                className="px-3 py-1 rounded-lg bg-amber-500 text-black font-extrabold hover:bg-amber-400 active:scale-95 text-xs transition-all cursor-pointer shadow-md"
              >
                Renovar Pase ($10)
              </button>
              <button
                onClick={() => setDismissExpirationBanner(true)}
                className="text-zinc-400 hover:text-white px-1 text-xs cursor-pointer"
                title="Ocultar aviso"
              >
                ✕
              </button>
            </div>
          </div>
        )}

      {/* Cloud Project Available Notification Banner (if saved project exists and workspace is fresh) */}
      {cloudProjectInfo?.hasProject && !hasRecordings && (
        <div className="bg-emerald-950/40 border-b border-emerald-500/30 px-3 sm:px-6 py-2 flex items-center justify-between text-xs text-emerald-200 z-20 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">
              Tienes 1 proyecto guardado en tu cuenta:{' '}
              <strong className="text-white font-mono">{cloudProjectInfo.projectMeta?.beatTitle}</strong>
              {cloudProjectInfo.projectMeta?.takesCount ? ` (${cloudProjectInfo.projectMeta.takesCount} tomas)` : ''}
            </span>
          </div>
          <button
            onClick={handleLoadCloudProject}
            disabled={isLoadingCloud}
            className="px-3 py-1 rounded-lg bg-emerald-500 text-black font-bold hover:bg-emerald-400 active:scale-95 text-xs transition-all shrink-0 ml-3 cursor-pointer"
          >
            {isLoadingCloud ? 'Cargando...' : 'Cargar Proyecto'}
          </button>
        </div>
      )}

      {/* Main Studio Viewport Canvas */}
      <main className={`flex-1 min-h-0 flex flex-col items-center w-full mx-auto ${
        activeView === 'editor'
          ? 'overflow-y-auto px-1 sm:px-4 pb-1 pt-1 bg-[#09090b]'
          : 'pb-8 pt-1 bg-gradient-to-b from-[#fcd34d] via-[#fbbf24] to-[#f59e0b]'
      }`}>
        {activeView === 'studio' ? (
          <div className="w-full max-w-xl flex flex-col items-center">
            {/* Core Artwork & Unified Transport Player (1 Play, 1 Rec, Tempo & Escalas) */}
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
              isRecording={isRecording}
              isRecArmed={isRecArmed}
              onToggleRecArmed={handleToggleRecArmed}
              selectedTrack={selectedTrack}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}
              countInEnabled={countInEnabled}
              onToggleCountIn={() => setCountInEnabled(!countInEnabled)}
              bluetoothSyncEnabled={bluetoothSyncEnabled}
              bluetoothOffsetMs={bluetoothOffsetMs}
              onToggleBluetoothSync={handleToggleBluetoothSync}
              getMicLevel={() => (engine ? engine.getMicInputLevel() : 0)}
              getMicStatus={() => (engine ? engine.getMicInputStatus() : { level: 0, isSaturated: false, gainReductionDb: 0 })}
              onChangeBpm={(newBpm) => {
                if (currentBeat) {
                  const updated = { ...currentBeat, bpm: newBpm };
                  setCurrentBeat(updated);
                  currentBeatRef.current = updated;
                  if (engine) engine.updateBeatBpm(newBpm);
                }
              }}
              onChangeTonality={handleChangeTonality}
            />

            {/* Vocal Track Selector Dropdown (Lista Desplegable - minimal space) */}
            <VocalTrackDropdown
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              onSelectTrack={handleSelectTrack}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
              onChangeVolume={handleChangeTrackVolume}
              onChangePan={handleChangeTrackPan}
              onOpenFX={(trackId) => setActiveFXTrackId(trackId)}
              onAddBackingTrack={handleAddBackingTrack}
              canAddMoreTracks={canAddMoreTracks}
              isRecording={isRecording}
              activeRecordingTrackId={activeRecordingTrackId}
              canUndo={!isRecording && undoStack.length > 0}
              canRedo={!isRecording && redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </div>
        ) : (
          /* Dedicated Editing Workspace (Timeline with Beat + Vocal Tracks, moveable clips, micro-latency nudge, 2 leads) */
          <div className="w-full max-w-4xl flex flex-col items-center shrink-0 relative">
            {/* Signature collage watermark pattern */}
            <SignatureCollageBackdrop />

            {/* Multitrack Workspace: Action buttons fixed above, and tracks independently scrolling below */}
            <div className="w-full flex flex-col relative z-10">
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
              onChangeVolume={handleChangeTrackVolume}
              onChangePan={handleChangeTrackPan}
              beatVolume={beatFX.volume}
              onChangeBeatVolume={(vol) => setBeatFX((prev) => ({ ...prev, volume: vol }))}
              isBeatMuted={isBeatMuted}
              onToggleBeatMute={handleToggleBeatMute}
              onAddBackingTrack={handleAddBackingTrack}
              canAddMoreTracks={canAddMoreTracks}
              onDeleteTrack={handleDeleteCustomTrack}
              onOpenFX={(trackId) => setActiveFXTrackId(trackId)}
              selectedTrackId={selectedTrackId}
              onSelectTrack={handleSelectTrack}
              canUndo={!isRecording && undoStack.length > 0}
              canRedo={!isRecording && redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              undoCount={undoStack.length}
              redoCount={redoStack.length}
              onOpenLoadBeat={() => setShowLoadBeatModal(true)}
              currentBeatSlotIndex={currentBeatSlotIndex}
              totalSavedBeatsCount={savedCustomBeats.length}
              loopSettings={loopSettings}
              onOpenLoopModal={() => setShowLoopModal(true)}
              isRecording={isRecording}
              activeRecordingTrackId={activeRecordingTrackId}
              onStartRecord={handleStartRecord}
              onStopRecord={handleStopRecord}
              onSplitTake={handleSplitTake}
              onTrimTake={handleTrimTake}
              onToggleLockTake={handleToggleLockTake}
            />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Screen Export Action Dock: Spacious, easy to reach on mobile & desktop */}
      <footer className="sticky bottom-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800/80 px-4 py-2.5 flex items-center justify-between pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono font-bold text-zinc-100 truncate">
              {currentBeat?.title || 'Mi Proyecto'}
            </span>
            <span className="text-[10px] font-mono text-zinc-400 truncate">
              {tracks.reduce((acc, t) => acc + (t.clips?.length || (t.buffer ? 1 : 0)), 0)} tomas de voz
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={isRecording}
          className="flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-black font-mono font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer shrink-0"
          title="Exportar mezcla final y pistas de voz (WAV / Stems)"
        >
          <Download className="w-4 h-4 stroke-[2.5]" />
          <span>EXPORTAR PROYECTO</span>
        </button>
      </footer>

      {/* Toast Notification Container */}
      {toastMessage && (
        <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-start gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900/95 text-white border border-zinc-700 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-200 text-xs leading-relaxed font-mono w-max max-w-[90vw]">
          {toastMessage.type === 'error' && (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          {toastMessage.type === 'success' && (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          {toastMessage.type === 'info' && (
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span className="min-w-0 whitespace-normal break-words">{toastMessage.text}</span>
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
        onAuthSuccess={() => refreshStudioAccess(true)}
      />

      {/* Guide modal on how to install PWA on Android & iOS */}
      <InstallAppModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
      />

      {/* Startup Choice Modal: Continuar Último Proyecto vs Proyecto Nuevo */}
      <StartupProjectModal
        isOpen={showStartupModal}
        beatTitle={pendingStartupSession?.beatTitle || currentBeat?.title || 'Mi Beat'}
        takesCount={pendingStartupSession?.takesCount || 0}
        savedTimeText={pendingStartupSession?.savedTimeText}
        onContinueLastProject={handleContinueLastProject}
        onStartNewProject={handleStartNewProjectClean}
        onOpenDeviceProject={handleImportDeviceProject}
        onClose={handleContinueLastProject}
      />
    </div>
  );
}

export { App as StudioApp };
