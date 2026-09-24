import React, { useEffect, useState } from 'react';
import { Mic, Square, Timer, AlertTriangle, Headphones } from 'lucide-react';
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
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [isSaturated, setIsSaturated] = useState(false);
  const [gainReductionDb, setGainReductionDb] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let animId: number | null = null;

    if (isRecording) {
      setElapsedSec(0);
      const start = Date.now();
      interval = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - start) / 1000));
      }, 500);

      const trackStatus = () => {
        if (getMicStatus) {
          const status = getMicStatus();
          setMicLevel(status.level);
          setIsSaturated(status.isSaturated);
          setGainReductionDb(status.gainReductionDb);
        } else if (getMicLevel) {
          const lvl = getMicLevel();
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
  }, [isRecording, getMicLevel, getMicStatus]);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const hasTake = selectedTrack.buffer !== null;

  return (
    <div className="w-full max-w-md mx-auto px-4 my-3">
      <div className={`p-3 rounded-2xl border shadow-xl backdrop-blur-md transition-colors ${
        isSaturated && isRecording
          ? 'bg-red-950/40 border-red-500/60 shadow-red-500/20'
          : 'bg-zinc-900/90 border-zinc-800'
      }`}>
        {/* Top Info Bar */}
        <div className="flex items-center justify-between mb-2.5 px-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
              PISTA ACTIVA:
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {selectedTrack.name.toUpperCase()}
            </span>
            {hasTake && (
              <span className="text-[10px] font-mono text-emerald-400 font-medium">
                (Tiene toma)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Bluetooth Latency Compensation Button */}
            {onToggleBluetoothSync && (
              <button
                type="button"
                onClick={onToggleBluetoothSync}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono font-bold transition-all cursor-pointer ${
                  bluetoothSyncEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
                title={
                  bluetoothSyncEnabled
                    ? `Compensación de latencia activa (-${bluetoothOffsetMs}ms). Tu voz grabada con audífonos Bluetooth se sincroniza al beat automáticamente.`
                    : 'Activar si grabas con audífonos Bluetooth (AirPods, auriculares inalámbricos) para calibrar el retraso de audio y que tu voz no quede desfasada.'
                }
              >
                <Headphones className="w-3 h-3 text-current" />
                <span>{bluetoothSyncEnabled ? 'Modo BT: ON' : 'Modo BT'}</span>
              </button>
            )}

            {/* Quick Count-in switch */}
            <button
              type="button"
              onClick={onToggleCountIn}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                countInEnabled
                  ? 'bg-zinc-800 text-amber-300 border border-amber-500/30'
                  : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
              }`}
              title="Conteo de 1 compás antes de grabar"
            >
              <Timer className="w-3 h-3" />
              <span>1 Compás</span>
            </button>
          </div>
        </div>

        {/* Live Audio Level Meter & Anti-Saturation Protection Indicator */}
        {isRecording && (
          <div className="space-y-1 mb-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-400 font-semibold">ENERGÍA DE VOZ</span>
              {isSaturated ? (
                <span className="text-red-400 font-bold flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span>¡SATURANDO! Reduciendo automáticamente ({gainReductionDb < 0 ? `${gainReductionDb} dB` : '-1.5 dB'})</span>
                </span>
              ) : (
                <span className="text-emerald-400 font-medium">
                  {Math.round(micLevel * 100)}% {gainReductionDb < 0 ? `(Protegido ${gainReductionDb} dB)` : 'Nivel Óptimo'}
                </span>
              )}
            </div>

            {/* Meter Bar: turns completely bright RED if saturated */}
            <div className={`w-full h-2 rounded-full overflow-hidden transition-all ${
              isSaturated ? 'bg-red-950/80 border border-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-zinc-950'
            }`}>
              <div
                className={`h-full transition-all duration-75 ${
                  isSaturated
                    ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)]'
                    : 'bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(8, micLevel * 100))}%` }}
              />
            </div>
          </div>
        )}

        {/* Giant Tactile Record / Stop Action Button (Full Width, No Test Button) */}
        {isRecording ? (
          <button
            onClick={onStopRecord}
            className="w-full py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-sm font-bold flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(239,68,68,0.4)] active:scale-98 transition-all animate-pulse"
          >
            <Square className="w-5 h-5 fill-current" />
            <span>DETENER GRABACIÓN ({formatElapsed(elapsedSec)})</span>
          </button>
        ) : (
          <button
            onClick={() => onStartRecord(selectedTrack.id)}
            className={`w-full py-3.5 px-4 rounded-xl font-mono text-sm font-bold flex items-center justify-center gap-2.5 active:scale-98 transition-all shadow-lg ${
              hasTake
                ? 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
            }`}
          >
            <Mic className="w-5 h-5" />
            <span>{hasTake ? `REHACER TOMA (${selectedTrack.name.toUpperCase()})` : `GRABAR VOZ (${selectedTrack.name.toUpperCase()})`}</span>
          </button>
        )}
      </div>
    </div>
  );
};
