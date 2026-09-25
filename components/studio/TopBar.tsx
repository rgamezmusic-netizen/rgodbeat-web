import React from 'react';
import { Download, Upload, Mic, Layers, Disc3, Undo2, Redo2, HardDrive, Smartphone, Cloud, CloudUpload, Plus, Loader2 } from 'lucide-react';

interface TopBarProps {
  onOpenLoadBeat: () => void;
  onExport: () => void;
  isExporting: boolean;
  countInEnabled: boolean;
  onToggleCountIn: () => void;
  hasRecordings: boolean;
  isRecording: boolean;
  activeView: 'studio' | 'editor';
  onChangeView: (view: 'studio' | 'editor') => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoCount?: number;
  redoCount?: number;
  currentBeatTitle?: string;
  currentBeatBpm?: number;
  accessStatus?: {
    isDemo: boolean;
    hasActivePass: boolean;
    daysRemaining: number;
    email?: string | null;
  };
  onOpenUnlockModal?: () => void;
  onOpenInstallModal?: () => void;
  onSaveCloudProject?: () => void;
  onLoadCloudProject?: () => void;
  onNewProject?: () => void;
  isSavingCloud?: boolean;
  isLoadingCloud?: boolean;
  hasCloudProject?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenLoadBeat,
  onExport,
  isExporting,
  hasRecordings,
  isRecording,
  activeView,
  onChangeView,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoCount = 0,
  redoCount = 0,
  currentBeatTitle,
  currentBeatBpm,
  accessStatus,
  onOpenUnlockModal,
  onOpenInstallModal,
  onSaveCloudProject,
  onLoadCloudProject,
  onNewProject,
  isSavingCloud = false,
  isLoadingCloud = false,
  hasCloudProject = false,
}) => {
  return (
    <header
      style={{ paddingTop: 'max(16px, calc(env(safe-area-inset-top, 0px) + 12px))' }}
      className="sticky top-0 z-30 flex items-center justify-between px-2.5 sm:px-6 pb-2.5 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800/80 gap-1.5 sm:gap-4"
    >
      {/* Zone 1: Wordmark & Beat status badge */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
        <a
          href="/"
          className="flex items-center group shrink-0 h-10 sm:h-12 px-1 py-0.5 rounded-xl hover:bg-white/[0.06] transition-all"
          title="Volver a la tienda principal"
        >
          <img
            src="/images/rgodbeat-studio-logo.png"
            alt="RGodbeat Studio"
            className="h-9 sm:h-11 w-auto max-w-[125px] sm:max-w-[155px] object-contain filter brightness-125 drop-shadow-[0_0_12px_rgba(255,255,255,0.35)] group-hover:scale-105 transition-all duration-200"
          />
        </a>

        {/* Studio Access Badge (Active Pass vs Demo Mode) */}
        {accessStatus?.hasActivePass ? (
          <button
            type="button"
            onClick={onOpenUnlockModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 text-[10px] sm:text-xs font-mono font-bold shrink-0 cursor-pointer transition-all active:scale-95 shadow-sm"
            title={`Pase activo: quedan ${accessStatus.daysRemaining} días. Haz clic para ver detalles o gestionar cuenta.`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>{accessStatus.daysRemaining}d</span>
            <span>Activo</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenUnlockModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold cursor-pointer transition-all active:scale-95 shrink-0 shadow-sm"
            title="Haz clic para Iniciar Sesión en tu cuenta o activar tu pase"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>Demo</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400 text-black font-extrabold uppercase">
              Login
            </span>
          </button>
        )}

        {/* Current Beat Permanent Indicator Chip */}
        {currentBeatTitle && (
          <div
            onClick={onOpenLoadBeat}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-750 hover:border-amber-500/50 cursor-pointer text-xs font-mono transition-colors shadow-sm shrink-0"
            title="Beat activo cargado. Haz clic para cambiarlo o subir otro."
          >
            <HardDrive className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="text-zinc-200 max-w-[120px] lg:max-w-[160px] truncate font-medium">
              {currentBeatTitle}
            </span>
            {currentBeatBpm && (
              <span className="text-amber-400 font-bold text-[10px]">
                {currentBeatBpm}BPM
              </span>
            )}
          </div>
        )}
      </div>

      {/* Zone 2: View Switcher (Desktop only) & Physical Undo/Redo Dock */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* PHYSICAL UNDO / REDO DOCK */}
        <div className="flex items-center bg-zinc-900/90 p-0.5 sm:p-1 rounded-xl border border-zinc-800 shadow-inner shrink-0">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
              canUndo
                ? 'text-zinc-200 hover:text-white hover:bg-zinc-800 active:scale-95 text-amber-300'
                : 'text-zinc-600 cursor-not-allowed opacity-40'
            }`}
            title="Deshacer última acción (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Deshacer</span>
            {undoCount > 0 && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 font-bold text-zinc-400 hidden xs:inline">
                {undoCount}
              </span>
            )}
          </button>

          <div className="w-[1px] h-3.5 sm:h-4 bg-zinc-800 mx-0.5" />

          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
              canRedo
                ? 'text-zinc-200 hover:text-white hover:bg-zinc-800 active:scale-95 text-amber-300'
                : 'text-zinc-600 cursor-not-allowed opacity-40'
            }`}
            title="Rehacer acción (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Rehacer</span>
            {redoCount > 0 && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 font-bold text-zinc-400 hidden xs:inline">
                {redoCount}
              </span>
            )}
          </button>
        </div>

        {/* View Switcher (Desktop only to prevent mobile overlap since StudioApp has bottom buttons) */}
        <div className="hidden md:flex items-center bg-zinc-900/90 p-0.5 rounded-xl border border-zinc-800 shrink-0">
          <button
            onClick={() => onChangeView('studio')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              activeView === 'studio'
                ? 'bg-zinc-800 text-amber-300 shadow-sm border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Modo Reproductor y Grabación"
          >
            <Disc3 className="w-3.5 h-3.5" />
            <span>Estudio</span>
          </button>

          <button
            onClick={() => onChangeView('editor')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              activeView === 'editor'
                ? 'bg-amber-500 text-black shadow-sm font-bold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Espacio de Edición y Línea de Tiempo (Mover voces, dos leads)"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Editor</span>
          </button>
        </div>
      </div>

      {/* Zone 3: Actions (Project Cloud, Load Beat, Install App & Export) */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {onNewProject && (
          <button
            onClick={onNewProject}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all shrink-0 active:scale-95"
            title="Nuevo Proyecto (Limpiar pistas vocales y empezar nuevo)"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Nuevo</span>
          </button>
        )}

        {hasCloudProject && onLoadCloudProject && (
          <button
            onClick={onLoadCloudProject}
            disabled={isLoadingCloud}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-emerald-950/50 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-900/50 transition-all shrink-0 active:scale-95 shadow-sm"
            title="Cargar proyecto guardado en tu cuenta"
          >
            {isLoadingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <CloudUpload className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="hidden sm:inline">{isLoadingCloud ? 'Cargando...' : 'Cargar Cloud'}</span>
          </button>
        )}

        {onSaveCloudProject && (
          <button
            onClick={onSaveCloudProject}
            disabled={isSavingCloud}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all shrink-0 active:scale-95 shadow-sm ${
              isSavingCloud
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait'
                : 'bg-zinc-900 text-amber-400 border border-zinc-800 hover:bg-amber-500/10 hover:border-amber-500/40'
            }`}
            title="Guardar proyecto actual en tu cuenta (Beat + Voces + Efectos en la nube)"
          >
            {isSavingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="hidden sm:inline">{isSavingCloud ? 'Guardando...' : 'Guardar'}</span>
          </button>
        )}

        {onOpenInstallModal && (
          <button
            onClick={onOpenInstallModal}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all shrink-0"
            title="Cómo instalar RGODBEAT Studio como App en tu celular (Android e iOS)"
          >
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Instalar App</span>
          </button>
        )}

        <button
          onClick={onOpenLoadBeat}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all shrink-0"
          title="Gestión de Beats (Permanentes en memoria)"
        >
          <Upload className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Beats</span>
        </button>

        {isRecording && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-950/70 border border-red-500/40 text-red-400 text-xs font-mono animate-pulse shrink-0">
            <Mic className="w-3 h-3 text-red-400" />
            <span className="font-semibold text-[10px]">REC</span>
          </div>
        )}

        <button
          onClick={onExport}
          disabled={isExporting}
          className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm shrink-0 ${
            hasRecordings
              ? 'bg-amber-500 text-black hover:bg-amber-400 active:scale-95 shadow-amber-500/20'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
          title="Exportar demo con Beat + Voces editadas"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isExporting ? 'Exportando...' : 'Exportar'}</span>
        </button>
      </div>
    </header>
  );
};

