import React, { useRef, useState } from 'react';
import { Download, Upload, Mic, Layers, Disc3, Undo2, Redo2, HardDrive, Smartphone, Cloud, CloudUpload, Plus, Loader2, FolderOpen, Save, FolderKanban, X, LogOut } from 'lucide-react';

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
  const [showMobileProjectMenu, setShowMobileProjectMenu] = useState(false);

  return (
    <>
      <header
        style={{ paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 10px))' }}
        className="sticky top-0 z-30 flex items-center justify-between w-full max-w-full overflow-hidden px-2 sm:px-6 pb-2.5 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800/80 gap-1 sm:gap-4 box-border"
      >
      {/* Zone 1: Wordmark & Beat status badge */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
        <a
          href="/"
          onClick={(e) => {
            if (onSaveAndExit) {
              e.preventDefault();
              onSaveAndExit();
            }
          }}
          className="flex items-center group shrink-0 h-10 sm:h-12 px-1 py-0.5 rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer"
          title="Guardar y volver a la tienda principal"
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

      {/* Zone 2: View Switcher (Desktop only) & Physical Undo/Redo Dock (Desktop/Tablet only) */}
      <div className="hidden md:flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* PHYSICAL UNDO / REDO DOCK (Moved beneath REC button on mobile) */}
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
            <span>Deshacer</span>
            {undoCount > 0 && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 font-bold text-zinc-400">
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
            <span>Rehacer</span>
            {redoCount > 0 && (
              <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 font-bold text-zinc-400">
                {redoCount}
              </span>
            )}
          </button>
        </div>

        {/* View Switcher (Desktop only to prevent mobile overlap since StudioApp has bottom buttons) */}
        <div className="flex items-center bg-zinc-900/90 p-0.5 rounded-xl border border-zinc-800 shrink-0">
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

      {/* Zone 3: Actions (Mobile Project Drawer, Desktop Actions, Beats & Export) */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Mobile: Compact Project Drawer Button */}
        <button
          type="button"
          onClick={() => setShowMobileProjectMenu(true)}
          className="flex sm:hidden items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-mono font-semibold bg-zinc-900 text-amber-300 border border-zinc-800 hover:bg-zinc-800 active:scale-95 transition-all shrink-0 shadow-sm"
          title="Menú de proyectos (Nuevo, Guardar, Cargar)"
        >
          <FolderKanban className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-[11px]">Proyecto</span>
        </button>

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

        {/* Desktop / Tablet Only: Direct Project Action Buttons */}
        <div className="hidden sm:flex items-center gap-1 sm:gap-2 shrink-0">
          {onNewProject && (
            <button
              onClick={onNewProject}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all shrink-0 active:scale-95"
              title="Nuevo Proyecto (Limpiar pistas vocales y empezar nuevo)"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-400" />
              <span>Nuevo</span>
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
              <span>{isLoadingCloud ? 'Cargando...' : 'Cargar Cloud'}</span>
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
              <span>{isSavingCloud ? 'Guardando...' : 'Guardar'}</span>
            </button>
          )}

          {/* Guardar Proyecto en Móvil / PC (.rgodbeat) */}
          {onSaveDeviceProject && (
            <button
              onClick={onSaveDeviceProject}
              disabled={isSavingDevice}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-zinc-900 text-amber-300 border border-zinc-800 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all shrink-0 active:scale-95 shadow-sm"
              title="Guardar archivo de proyecto en tu móvil/computadora (.rgodbeat)"
            >
              {isSavingDevice ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Save className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span className="hidden md:inline">En Móvil</span>
            </button>
          )}

          {/* Abrir Proyecto desde Móvil / PC (.rgodbeat) */}
          {onLoadDeviceProject && (
            <button
              onClick={() => deviceFileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-zinc-900 text-purple-300 border border-zinc-800 hover:border-purple-500/40 hover:bg-purple-950/30 transition-all shrink-0 active:scale-95"
              title="Abrir un archivo de proyecto (.rgodbeat) desde tu móvil o PC"
            >
              <FolderOpen className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden md:inline">Abrir</span>
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

          {onSaveAndExit && (
            <button
              onClick={onSaveAndExit}
              disabled={isSavingAndExiting}
              className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-red-950/40 hover:text-red-300 hover:border-red-500/40 transition-all shrink-0 active:scale-95"
              title="Guardar sesión actual y salir a la tienda"
            >
              {isSavingAndExiting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
              ) : (
                <LogOut className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className="hidden md:inline">Salir</span>
            </button>
          )}
        </div>

        {/* Universal Beat Library Button */}
        <button
          onClick={onOpenLoadBeat}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-all shrink-0 active:scale-95"
          title="Gestión de Beats (Permanentes en memoria)"
        >
          <Upload className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden xs:inline">Beats</span>
        </button>

        {isRecording && (
          <div className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-full bg-red-950/70 border border-red-500/40 text-red-400 text-xs font-mono animate-pulse shrink-0">
            <Mic className="w-3 h-3 text-red-400" />
            <span className="font-semibold text-[9px] sm:text-[10px]">REC</span>
          </div>
        )}

        {/* Export Demo Button */}
        <button
          onClick={onExport}
          disabled={isExporting}
          className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm shrink-0 active:scale-95 ${
            hasRecordings
              ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/20'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
          title="Exportar demo con Beat + Voces editadas"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="text-[11px] sm:text-xs">{isExporting ? 'Exportando...' : 'Exportar'}</span>
        </button>
      </div>
    </header>

    {/* Mobile Project Menu Modal / Drawer - Placed outside sticky/overflow-hidden header */}
    {showMobileProjectMenu && (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={() => setShowMobileProjectMenu(false)}
      >
        <div
          className="w-full sm:max-w-md bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-4 shadow-2xl space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-mono font-bold text-zinc-200 uppercase tracking-wider">
                Gestión del Proyecto
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileProjectMenu(false)}
              className="p-1 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {onNewProject && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileProjectMenu(false);
                  onNewProject();
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 text-left transition-all active:scale-98"
              >
                <div className="p-2 rounded-lg bg-zinc-800 text-zinc-300">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-zinc-200">Nuevo Proyecto</div>
                  <div className="text-[10px] text-zinc-400">Limpiar tomas y empezar una sesión nueva</div>
                </div>
              </button>
            )}

            {onSaveCloudProject && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileProjectMenu(false);
                  onSaveCloudProject();
                }}
                disabled={isSavingCloud}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-amber-500/30 text-left transition-all active:scale-98"
              >
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300">
                  {isSavingCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-amber-300">Guardar en la Nube</div>
                  <div className="text-[10px] text-zinc-400">Guardar beat + voces + efectos en tu cuenta</div>
                </div>
              </button>
            )}

            {hasCloudProject && onLoadCloudProject && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileProjectMenu(false);
                  onLoadCloudProject();
                }}
                disabled={isLoadingCloud}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-emerald-500/30 text-left transition-all active:scale-98"
              >
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  {isLoadingCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-emerald-400">Cargar desde la Nube</div>
                  <div className="text-[10px] text-zinc-400">Restaurar proyecto guardado en tu cuenta</div>
                </div>
              </button>
            )}

            {onSaveDeviceProject && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileProjectMenu(false);
                  onSaveDeviceProject();
                }}
                disabled={isSavingDevice}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 text-left transition-all active:scale-98"
              >
                <div className="p-2 rounded-lg bg-zinc-800 text-amber-400">
                  {isSavingDevice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-zinc-200">Guardar en este Móvil</div>
                  <div className="text-[10px] text-zinc-400">Descargar archivo .rgodbeat al almacenamiento</div>
                </div>
              </button>
            )}

            {onLoadDeviceProject && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileProjectMenu(false);
                  deviceFileInputRef.current?.click();
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 text-left transition-all active:scale-98"
              >
                <div className="p-2 rounded-lg bg-purple-950/50 text-purple-400">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-purple-300">Abrir desde Móvil (.rgodbeat)</div>
                  <div className="text-[10px] text-zinc-400">Cargar archivo guardado en tu teléfono</div>
                </div>
              </button>
            )}

            {onOpenInstallModal && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileProjectMenu(false);
                  onOpenInstallModal();
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 text-left transition-all active:scale-98"
              >
                <div className="p-2 rounded-lg bg-zinc-800 text-amber-400">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-zinc-200">Instalar como App</div>
                  <div className="text-[10px] text-zinc-400">Crear acceso directo en pantalla de inicio</div>
                </div>
              </button>
            )}

            {onSaveAndExit && (
              <button
                type="button"
                onClick={() => {
                  setShowMobileProjectMenu(false);
                  onSaveAndExit();
                }}
                disabled={isSavingAndExiting}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-red-950/30 hover:bg-red-950/50 border border-red-500/40 text-left transition-all active:scale-98"
              >
                <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
                  {isSavingAndExiting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-red-300">Guardar y Salir</div>
                  <div className="text-[10px] text-zinc-400">Guarda beat + voces en tu teléfono y vuelve a la tienda</div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    )}
  </>
);
};

