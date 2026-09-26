import React, { useEffect, useState, useRef } from 'react';
import { Mic, Square, Timer, AlertTriangle, Headphones, Undo2, Redo2 } from 'lucide-react';
import { VocalTrack, VocalTrackId } from '@/lib/studio/types/audio';

interface RecordControlBarProps {
  selectedTrack: VocalTrack;
  isRecording: boolean;
  recordingTrackId: VocalTrackId | null;
  countInEnabled: boolean;
  onToggleCountIn: () => void;
  bluetoothSyncEnabled?: boolean;
  bluetoothOffsetMs?: number;
  onToggleBluetoothSync?: () => void;
  onStartRecord: (trackId: VocalTrackId) => void;
  onStopRecord: () => void;
  onGenerateTestTake?: (trackId: VocalTrackId) => void;
  getMicLevel?: () => number;
  getMicStatus?: () => { level: number; isSaturated: boolean; gainReductionDb: number };
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  tracks?: VocalTrack[];
  onSelectTrack?: (trackId: VocalTrackId) => void;
  undoCount?: number;
  redoCount?: number;
}

export const RecordControlBar: React.FC<RecordControlBarProps> = ({
  selectedTrack,
  isRecording,
  recordingTrackId: _recordingTrackId,
  countInEnabled,
  onToggleCountIn,
  bluetoothSyncEnabled = false,
  bluetoothOffsetMs = 185,
  onToggleBluetoothSync,
  onStartRecord,
  onStopRecord,
  getMicLevel,
  getMicStatus,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  tracks,
  onSelectTrack,
  undoCount = 0,
  redoCount = 0,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [isSaturated, setIsSaturated] = useState(false);
  const [gainReductionDb, setGainReductionDb] = useState(0);

  const getMicStatusRef = useRef(getMicStatus);
  getMicStatusRef.current = getMicStatus;
  const getMicLevelRef = useRef(getMicLevel);
  getMicLevelRef.current = getMicLevel;

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let animId: number | null = null;

    if (isRecording) {
      setElapsedSec(0);
      const start = Date.now();
      interval = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - start) / 1000));
      }, 200);

      const trackStatus = () => {
        if (getMicStatusRef.current) {
          const status = getMicStatusRef.current();
          setMicLevel(status.level);
          setIsSaturated(status.isSaturated);
          setGainReductionDb(status.gainReductionDb);
        } else if (getMicLevelRef.current) {
          const lvl = getMicLevelRef.current();
          setMicLevel(lvl);
          setIsSaturated(lvl >= 0.88);
        }
        animId = requestAnimationFrame(trackStatus);
      };
      animId = requestAnimationFrame(trackStatus);
    } else {
      setElapsedSec(0);
      setMicLevel(0);
      setIsSaturated(false);
      setGainReductionDb(0);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isRecording]);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const hasTake = selectedTrack.buffer !== null;

  return (
    <div className="w-full max-w-md mx-auto px-3 my-2">
      <div
        className={`p-3 rounded-2xl border shadow-xl backdrop-blur-md transition-colors ${
          isSaturated && isRecording
            ? 'bg-red-950/40 border-red-500/60 shadow-red-500/20'
            : 'bg-[#0e0e14]/90 border-zinc-800'
        }`}
      >
        {/* Top Header: Track Name & Quick Utility Badges */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              PISTA:
            </span>
            <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {selectedTrack.name.toUpperCase()}
            </span>
            {hasTake && (
              <span className="text-[10px] font-mono text-emerald-400 font-medium">
                ● Grabada
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Bluetooth Latency Compensation */}
            {onToggleBluetoothSync && (
              <button
                type="button"
                onClick={onToggleBluetoothSync}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  bluetoothSyncEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                    : 'bg-zinc-850 text-zinc-400 hover:text-zinc-200 border border-zinc-750'
                }`}
                title={
                  bluetoothSyncEnabled
                    ? `Compensación de latencia activa (-${bluetoothOffsetMs}ms). Tu voz con audífonos Bluetooth se sincroniza al beat.`
                    : 'Activar para audífonos Bluetooth (AirPods, inalámbricos) para calibrar el retraso de audio.'
                }
              >
                <Headphones className="w-3 h-3" />
                <span>{bluetoothSyncEnabled ? 'BT ON' : 'Sync BT'}</span>
              </button>
            )}

            {/* Metronome Count-in switch */}
            <button
              type="button"
              onClick={onToggleCountIn}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                countInEnabled
                  ? 'bg-zinc-800 text-amber-300 border border-amber-500/30'
                  : 'bg-zinc-850 text-zinc-500 border border-zinc-750'
              }`}
              title="Conteo de 1 compás antes de grabar"
            >
              <Timer className="w-3 h-3" />
              <span>1 Compás</span>
            </button>
          </div>
        </div>

        {/* Track Switcher Pills (BandLab flow) */}
        {tracks && onSelectTrack && tracks.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-2 no-scrollbar scroll-smooth">
            {tracks.map((t) => {
              const isSelected = t.id === selectedTrack.id;
              const isRecThis = isRecording && _recordingTrackId === t.id;
              const hasClips = Boolean(t.buffer || (t.clips && t.clips.length > 0));
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTrack(t.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all shrink-0 cursor-pointer active:scale-95 ${
                    isRecThis
                      ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/40 ring-1 ring-red-400'
                      : isSelected
                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                      : 'bg-zinc-850/90 text-zinc-300 hover:text-white hover:bg-zinc-750 border border-zinc-750'
                  }`}
                  title={isRecording ? `Cambiar grabación a ${t.name}` : `Seleccionar ${t.name}`}
                >
                  {isRecThis ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />
                  ) : hasClips ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
                  )}
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Recording Banner & Meter */}
        {isRecording && (
          <div className="space-y-1.5 mb-2">
            <div className="flex items-center justify-between bg-red-950/70 border border-red-500/60 rounded-xl px-3 py-1.5 shadow-lg shadow-red-500/10">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-mono font-bold text-red-200 uppercase tracking-wider">
                  GRABANDO EN {selectedTrack.name.toUpperCase()}
                </span>
              </div>
              <span className="font-mono text-sm font-extrabold text-white bg-black/60 px-2 py-0.5 rounded-md border border-red-500/40">
                {formatElapsed(elapsedSec)}
              </span>
            </div>

            {/* Level Meter Bar */}
            <div className="space-y-0.5">
              <div className="flex items-center justify-between text-[9px] font-mono">
                <span className="text-zinc-400 font-semibold">NIVEL DE MICRÓFONO</span>
                {isSaturated ? (
                  <span className="text-red-400 font-bold flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-2.5 h-2.5 text-red-400" />
                    <span>¡SATURANDO! Reduciendo automáticamente</span>
                  </span>
                ) : (
                  <span className="text-emerald-400 font-medium">
                    {Math.round(micLevel * 100)}% {gainReductionDb < 0 ? `(Protegido ${gainReductionDb}dB)` : 'Óptimo'}
                  </span>
                )}
              </div>

              <div
                className={`w-full h-1.5 rounded-full overflow-hidden transition-all ${
                  isSaturated ? 'bg-red-950/80 border border-red-500/60' : 'bg-zinc-950'
                }`}
              >
                <div
                  className={`h-full transition-all duration-75 ${
                    isSaturated
                      ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)]'
                      : 'bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(8, micLevel * 100))}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Giant Tactile Record / Stop Action Button */}
        {isRecording ? (
          <button
            type="button"
            onClick={onStopRecord}
            className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-sm font-bold flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.4)] active:scale-98 transition-all animate-pulse cursor-pointer"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>DETENER GRABACIÓN ({formatElapsed(elapsedSec)})</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onStartRecord(selectedTrack.id)}
            className="w-full py-3 px-4 rounded-xl font-mono text-sm font-bold flex items-center justify-center gap-2 active:scale-98 transition-all shadow-lg bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 cursor-pointer"
            title="Grabar en esta pista (Punch-in automático)"
          >
            <Mic className="w-4 h-4 fill-current" />
            <span>GRABAR VOZ ({selectedTrack.name.toUpperCase()})</span>
          </button>
        )}

        {/* Subtle Undo / Redo controls */}
        {(onUndo || onRedo) && (
          <div className="flex items-center justify-center gap-2 mt-2 pt-1.5 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
                canUndo
                  ? 'bg-zinc-850 text-amber-300 hover:bg-zinc-750 hover:text-amber-200 border border-zinc-700 active:scale-95 cursor-pointer'
                  : 'bg-zinc-900/40 text-zinc-600 border border-zinc-850 cursor-not-allowed opacity-40'
              }`}
              title="Deshacer última acción (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3" />
              <span>Deshacer</span>
              {undoCount > 0 && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-900 font-bold text-zinc-400">
                  {undoCount}
                </span>
              )}
            </button>

            <div className="w-[1px] h-3.5 bg-zinc-800" />

            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
                canRedo
                  ? 'bg-zinc-850 text-amber-300 hover:bg-zinc-750 hover:text-amber-200 border border-zinc-700 active:scale-95 cursor-pointer'
                  : 'bg-zinc-900/40 text-zinc-600 border border-zinc-850 cursor-not-allowed opacity-40'
              }`}
              title="Rehacer acción (Ctrl+Y)"
            >
              <Redo2 className="w-3 h-3" />
              <span>Rehacer</span>
              {redoCount > 0 && (
                <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-900 font-bold text-zinc-400">
                  {redoCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
