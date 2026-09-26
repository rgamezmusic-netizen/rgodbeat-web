import React, { useRef, useState, useEffect } from 'react';
import {
  Download,
  Upload,
  Mic,
  Layers,
  Disc3,
  Undo2,
  Redo2,
  HardDrive,
  Smartphone,
  Cloud,
  CloudUpload,
  Plus,
  Loader2,
  FolderOpen,
  Save,
  FolderKanban,
  X,
  LogOut,
  ChevronDown,
  Music,
} from 'lucide-react';

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
  onSaveDeviceProject?: () => void;
  onLoadDeviceProject?: (file: File) => void;
  isSavingDevice?: boolean;
  isSavingCloud?: boolean;
  isLoadingCloud?: boolean;
  hasCloudProject?: boolean;
  onSaveAndExit?: () => void;
  isSavingAndExiting?: boolean;
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
  onSaveDeviceProject,
  onLoadDeviceProject,
  isSavingDevice = false,
  isSavingCloud = false,
  isLoadingCloud = false,
  hasCloudProject = false,
  onSaveAndExit,
  isSavingAndExiting = false,
}) => {
  const deviceFileInputRef = useRef<HTMLInputElement>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
    };
    if (showProjectMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProjectMenu]);

  return (
    <>
      <header
        style={{ paddingTop: 'max(8px, calc(env(safe-area-inset-top, 0px) + 6px))' }}
        className="sticky top-0 z-30 flex flex-nowrap items-center justify-between w-full h-14 sm:h-16 px-2 sm:px-5 pb-1 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800/80 gap-1.5 sm:gap-3 box-border overflow-hidden"
      >
        {/* LEFT ZONE: Logo & Beat Chip */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
          <a
            href="/"
            onClick={(e) => {
              if (onSaveAndExit) {
                e.preventDefault();
                onSaveAndExit();
              }
            }}
            className="flex items-center group shrink-0 h-8 sm:h-10 px-0.5 rounded-lg hover:bg-white/[0.06] transition-all cursor-pointer"
            title="Guardar y volver a la tienda principal"
          >
            <img
              src="/images/rgodbeat-studio-logo.png"
              alt="RGodbeat Studio"
              className="h-6 sm:h-8 w-auto max-w-[85px] sm:max-w-[130px] object-contain filter brightness-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] group-hover:scale-105 transition-all duration-200"
            />
          </a>

          {/* Clean Beat Selector Pill */}
          <button
            type="button"
            onClick={onOpenLoadBeat}
            className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-zinc-900/90 border border-zinc-750 hover:border-amber-500/50 cursor-pointer text-[10px] sm:text-xs font-mono transition-all shadow-sm shrink min-w-0 active:scale-95"
            title="Cambiar beat o cargar archivo de audio"
          >
            <Music className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-zinc-200 max-w-[70px] sm:max-w-[130px] truncate font-medium">
              {currentBeatTitle || 'Beat'}
            </span>
            {currentBeatBpm ? (
              <span className="text-amber-400 font-bold text-[9px] sm:text-[10px] hidden sm:inline shrink-0">
                {currentBeatBpm}BPM
              </span>
            ) : null}
          </button>
        </div>

        {/* CENTER ZONE: Unified Minimal View Switcher (Flow iPod vs Flow BandLab) */}
        <div className="flex items-center bg-zinc-900/95 p-0.5 sm:p-1 rounded-xl border border-zinc-800 shadow-inner shrink-0">
          <button
            type="button"
            onClick={() => onChangeView('studio')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-mono font-bold transition-all cursor-pointer ${
              activeView === 'studio'
                ? 'bg-zinc-800 text-amber-300 shadow-sm border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Vista Grabador & Reproductor"
          >
            <Disc3 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Grabador</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeView('editor')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-mono font-bold transition-all cursor-pointer relative ${
              activeView === 'editor'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 font-extrabold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Vista Multitrack & Edición"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Multitrack</span>
            {hasRecordings && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            )}
          </button>
        </div>

        {/* RIGHT ZONE: Project Menu & Export Button */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Subtle Undo / Redo for quick correction */}
          <div className="hidden lg:flex items-center bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800 shrink-0">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`p-1.5 rounded-md text-xs transition-all ${
                canUndo ? 'text-amber-300 hover:bg-zinc-800 cursor-pointer' : 'text-zinc-600 opacity-40 cursor-not-allowed'
              }`}
              title="Deshacer (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`p-1.5 rounded-md text-xs transition-all ${
                canRedo ? 'text-amber-300 hover:bg-zinc-800 cursor-pointer' : 'text-zinc-600 opacity-40 cursor-not-allowed'
              }`}
              title="Rehacer (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unified Project Dropdown Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowProjectMenu(!showProjectMenu)}
              className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-mono font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
              title="Menú de Proyecto"
            >
              <FolderKanban className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden md:inline">Proyecto</span>
              <ChevronDown className="w-3 h-3 text-zinc-500 hidden sm:inline" />
            </button>

            {/* Dropdown Menu Box */}
            {showProjectMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#0e0e14] border border-zinc-700/80 shadow-2xl z-50 p-2 space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                {/* Save Cloud */}
                {onSaveCloudProject && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      onSaveCloudProject();
                    }}
                    disabled={isSavingCloud}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-amber-300 hover:bg-amber-500/15 transition-all text-left cursor-pointer"
                  >
                    {isSavingCloud ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    ) : (
                      <Cloud className="w-4 h-4 text-amber-400" />
                    )}
                    <span>{isSavingCloud ? 'Guardando...' : 'Guardar en la Nube'}</span>
                  </button>
                )}

                {/* Load Cloud */}
                {hasCloudProject && onLoadCloudProject && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      onLoadCloudProject();
                    }}
                    disabled={isLoadingCloud}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-emerald-300 hover:bg-emerald-500/15 transition-all text-left cursor-pointer"
                  >
                    {isLoadingCloud ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    ) : (
                      <CloudUpload className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>{isLoadingCloud ? 'Cargando...' : 'Cargar de la Nube'}</span>
                  </button>
                )}

                <div className="h-[1px] bg-zinc-800 my-1" />

                {/* Save Local Device */}
                {onSaveDeviceProject && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      onSaveDeviceProject();
                    }}
                    disabled={isSavingDevice}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-zinc-300 hover:bg-zinc-800 transition-all text-left cursor-pointer"
                  >
                    <Save className="w-4 h-4 text-zinc-400" />
                    <span>Descargar archivo (.rgodbeat)</span>
                  </button>
                )}

                {/* Load Local Device */}
                {onLoadDeviceProject && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      deviceFileInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-purple-300 hover:bg-purple-950/30 transition-all text-left cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 text-purple-400" />
                    <span>Abrir archivo (.rgodbeat)</span>
                  </button>
                )}

                {/* New Project */}
                {onNewProject && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      onNewProject();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-zinc-300 hover:bg-zinc-800 transition-all text-left cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-zinc-400" />
                    <span>Nuevo Proyecto</span>
                  </button>
                )}

                <div className="h-[1px] bg-zinc-800 my-1" />

                {/* Install App */}
                {onOpenInstallModal && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      onOpenInstallModal();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-zinc-300 hover:bg-zinc-800 transition-all text-left cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <span>Instalar App Móvil</span>
                  </button>
                )}

                {/* Exit */}
                {onSaveAndExit && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      onSaveAndExit();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-red-300 hover:bg-red-950/30 transition-all text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-red-400" />
                    <span>Guardar y Salir</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Hidden file input for opening .rgodbeat files */}
          {onLoadDeviceProject && (
            <input
              ref={deviceFileInputRef}
              type="file"
              accept=".rgodbeat,.json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onLoadDeviceProject(f);
                e.target.value = '';
              }}
            />
          )}

          {/* Recording Badge */}
          {isRecording && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-950/70 border border-red-500/50 text-red-400 text-xs font-mono animate-pulse shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span className="font-bold text-[10px]">REC</span>
            </div>
          )}

          {/* Primary Export Button */}
          <button
            onClick={onExport}
            disabled={isExporting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all shadow-md shrink-0 cursor-pointer active:scale-95 ${
              isExporting
                ? 'bg-zinc-800 text-zinc-500 cursor-wait'
                : 'bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:brightness-110 shadow-amber-500/20'
            }`}
            title="Exportar mezcla final WAV/MP3 o pistas de voz por separado"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Exportar</span>
          </button>
        </div>
      </header>
    </>
  );
};
