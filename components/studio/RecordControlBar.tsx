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

  return (
    <div className="w-full max-w-md mx-auto px-2 my-1">
      <div
        className={`p-2 rounded-xl border shadow-lg backdrop-blur-md transition-colors ${
          isSaturated && isRecording
            ? 'bg-red-950/40 border-red-500/60 shadow-red-500/20'
            : 'bg-[#0e0e14]/90 border-zinc-800'
        }`}
      >
        {/* Row 1: Track Selector Pills & Tools (Single compact line) */}
        <div className="flex items-center justify-between gap-1 mb-1.5 px-0.5">
          {/* Track selector pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {tracks &&
              onSelectTrack &&
              tracks.map((t) => {
                const isSelected = t.id === selectedTrack.id;
                const isRecThis = isRecording && _recordingTrackId === t.id;
                const hasClips = Boolean(t.buffer || (t.clips && t.clips.length > 0));
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTrack(t.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-all shrink-0 cursor-pointer active:scale-95 ${
                      isRecThis
                        ? 'bg-red-500 text-white animate-pulse shadow-sm shadow-red-500/40'
                        : isSelected
                        ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                        : 'bg-zinc-800/90 text-zinc-400 hover:text-white border border-zinc-750'
                    }`}
                    title={`Pista ${t.name}`}
                  >
                    {isRecThis ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />
                    ) : hasClips ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    ) : null}
                    <span>{t.name}</span>
                  </button>
                );
              })}
          </div>

          {/* Compact utility controls: BT Sync, Count-in, Undo, Redo */}
          <div className="flex items-center gap-0.5 shrink-0">
            {onToggleBluetoothSync && (
              <button
                type="button"
                onClick={onToggleBluetoothSync}
                className={`p-1 rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  bluetoothSyncEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={
                  bluetoothSyncEnabled
                    ? `Bluetooth Sync Activo (-${bluetoothOffsetMs}ms)`
                    : 'Calibrar audífonos Bluetooth (AirPods, etc.)'
                }
              >
                <Headphones className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleCountIn}
              className={`p-1 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                countInEnabled
                  ? 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title={countInEnabled ? 'Conteo de 1 compás activo' : 'Activar conteo previo de 1 compás'}
            >
              <Timer className="w-3.5 h-3.5" />
            </button>

            {(onUndo || onRedo) && (
              <>
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={`p-1 rounded-md transition-all ${
                    canUndo
                      ? 'text-amber-300 hover:text-amber-200 cursor-pointer'
                      : 'text-zinc-650 opacity-30 cursor-not-allowed'
                  }`}
                  title="Deshacer (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={`p-1 rounded-md transition-all ${
                    canRedo
                      ? 'text-amber-300 hover:text-amber-200 cursor-pointer'
                      : 'text-zinc-650 opacity-30 cursor-not-allowed'
                  }`}
                  title="Rehacer (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: The Primary Recording Action Button & Minimal Audio Level Meter */}
        {isRecording ? (
          <div className="space-y-1">
            <button
              type="button"
              onClick={onStopRecord}
              className="w-full py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(239,68,68,0.4)] active:scale-98 transition-all animate-pulse cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>DETENER GRABACIÓN ({formatElapsed(elapsedSec)}) · {selectedTrack.name.toUpperCase()}</span>
            </button>

            {/* Sleek audio level meter line */}
            <div className="w-full h-1 rounded-full overflow-hidden bg-zinc-950">
              <div
                className={`h-full transition-all duration-75 ${
                  isSaturated
                    ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]'
                    : 'bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(8, micLevel * 100))}%` }}
              />
            </div>

            {isSaturated && (
              <div className="text-center text-[9px] font-mono text-red-400 font-bold animate-pulse flex items-center justify-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>¡Saturando! Auto-reduciendo ganancia ({gainReductionDb < 0 ? `${gainReductionDb}dB` : '-1.5dB'})</span>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onStartRecord(selectedTrack.id)}
            className="w-full py-2.5 px-3 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-2 active:scale-98 transition-all shadow-md bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 cursor-pointer"
            title="Grabar en esta pista (Punch-in automático)"
          >
            <Mic className="w-4 h-4 fill-current" />
            <span>GRABAR VOZ ({selectedTrack.name.toUpperCase()})</span>
          </button>
        )}
      </div>
    </div>
  );
};
