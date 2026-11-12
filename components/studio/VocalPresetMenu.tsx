import React from 'react';
import { Check, Radio, RotateCcw, Sparkles, X } from 'lucide-react';
import type { VocalPresetId, VocalTrack } from '@/lib/studio/types/audio';
import { VOCAL_FX_PRESETS } from '@/lib/studio/audio/vocalPresets';
import { useStudioI18n } from '@/lib/studio/i18n';

interface VocalPresetModalProps {
  track: VocalTrack | null;
  onClose: () => void;
  onSelectPreset: (presetId: VocalPresetId) => void;
  onResetNatural?: () => void;
}

/**
 * Minimalist one-tap vocal preset selector anchored over the workspace.
 */
export const VocalPresetModal: React.FC<VocalPresetModalProps> = ({
  track,
  onClose,
  onSelectPreset,
  onResetNatural,
}) => {
  const { t } = useStudioI18n();
  if (!track) return null;

  const activePresetId = track.fx.presetId;

  const getPresetLabel = (id: VocalPresetId, defaultLabel: string) => {
    switch (id) {
      case 'lead_pro': return t.presets.pro;
      case 'urban_air': return t.presets.urbanAir;
      case 'radio': return t.presets.radio;
      case 'space_hall': return t.presets.spaceEcho;
      case 'slap_tape': return t.presets.intimateDry;
      default: return defaultLabel;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${t.presets.title}: ${track.name}`}
    >
      <div
        className="w-full max-w-sm bg-[#111116] border border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <h3 className="text-sm font-bold font-display uppercase tracking-wide truncate">
              {track.name} · {t.presets.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {VOCAL_FX_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            const isRadio = preset.id === 'radio';
            const displayLabel = getPresetLabel(preset.id, preset.label);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onSelectPreset(preset.id);
                  onClose();
                }}
                aria-pressed={isActive}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-all cursor-pointer active:scale-[0.99] ${
                  isActive
                    ? 'bg-amber-500/15 border-amber-400/70 text-white'
                    : 'bg-zinc-900/70 hover:bg-zinc-800/80 border-zinc-800 text-zinc-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isRadio && (
                      <Radio className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold font-display tracking-wide truncate">
                      {displayLabel}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${
                        preset.role === 'Efecto'
                          ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {preset.role === 'Efecto' ? t.presets.fx : t.presets.main}
                    </span>
                  </div>
                </div>

                {isActive && (
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {onResetNatural && (
          <button
            type="button"
            onClick={() => {
              onResetNatural();
              onClose();
            }}
            className="mt-3 w-full py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{t.presets.naturalNoPreset}</span>
          </button>
        )}
      </div>
    </div>
  );
};

interface VocalPresetStripProps {
  activePresetId?: VocalPresetId;
  onSelectPreset: (presetId: VocalPresetId) => void;
}

/**
 * Compact horizontal preset strip rendered inside the FX modal.
 */
export const VocalPresetStrip: React.FC<VocalPresetStripProps> = ({
  activePresetId,
  onSelectPreset,
}) => {
  const { t } = useStudioI18n();
  return (
    <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold font-mono uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          {t.presets.quickPresets}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {VOCAL_FX_PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.id)}
              aria-pressed={isActive}
              title={preset.label}
              className={`py-1.5 px-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer truncate ${
                isActive
                  ? 'bg-amber-500 text-black shadow'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {preset.badge}
            </button>
          );
        })}
      </div>
    </div>
  );
};

