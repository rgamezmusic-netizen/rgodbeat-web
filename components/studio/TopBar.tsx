import Link from 'next/link';
import React, { useRef, useState, useEffect } from 'react';
import type { CloudProjectSlotInfo } from '@/lib/studio/cloudProject';
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
  User,
  ShieldCheck,
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
    isLoggedIn?: boolean;
    hasActivePass: boolean;
    daysRemaining: number;
    email?: string | null;
    name?: string;
  };
  onOpenUnlockModal?: () => void;
  onLogout?: () => void;
  onOpenInstallModal?: () => void;
  onSaveCloudProject?: () => void;
  onLoadCloudProject?: () => void;
  onLoadPreviousCloudProject?: () => void;
  onNewProject?: () => void;
  onSaveDeviceProject?: () => void;
  onLoadDeviceProject?: (file: File) => void;
  isSavingDevice?: boolean;
  isSavingCloud?: boolean;
  isLoadingCloud?: boolean;
  hasCloudProject?: boolean;
  hasPreviousCloudProject?: boolean;
  cloudSlots?: CloudProjectSlotInfo[];
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
  onLogout,
  onOpenInstallModal,
  onSaveCloudProject,
  onLoadCloudProject,
  onLoadPreviousCloudProject,
  onNewProject,
  onSaveDeviceProject,
  onLoadDeviceProject,
  isSavingDevice = false,
  isSavingCloud = false,
  isLoadingCloud = false,
  hasCloudProject = false,
  hasPreviousCloudProject = false,
  cloudSlots,
  onSaveAndExit,
  isSavingAndExiting = false,
}) => {
  const deviceFileInputRef = useRef<HTMLInputElement>(null);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowProjectMenu(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    if (showProjectMenu || showAccountMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProjectMenu, showAccountMenu]);

  const isUserLoggedIn = Boolean(accessStatus?.isLoggedIn || accessStatus?.email);
  const isSuperAdmin = ['admin@rgodbeat.com', 'rgamezmusic@gmail.com', 'rgodbeat@gmail.com'].includes(
    accessStatus?.email?.toLowerCase() || ''
  );
  const daysText = isSuperAdmin
    ? 'Pase VIP'
    : accessStatus?.daysRemaining && accessStatus.daysRemaining > 0
    ? `${accessStatus.daysRemaining} ${accessStatus.daysRemaining === 1 ? 'día' : 'días'}`
    : accessStatus?.hasActivePass
    ? 'Pase Activo'
    : 'Conectado';

  return (
    <>
      <header
        style={{ paddingTop: 'max(8px, calc(env(safe-area-inset-top, 0px) + 6px))' }}
        className="sticky top-0 z-30 flex flex-nowrap items-center justify-between w-full min-h-[52px] sm:min-h-[58px] px-2 sm:px-4 py-1.5 sm:py-2 bg-[#09090b]/95 backdrop-blur-md border-b border-zinc-800/80 gap-1 sm:gap-2 box-border"
      >
        {/* LEFT ZONE: Studio Logo */}
        <div className="flex items-center min-w-0 shrink-0">
          <Link
            href="/"
            onClick={(e) => {
              if (onSaveAndExit) {
                e.preventDefault();
                onSaveAndExit();
              }
            }}
            className="flex items-center group shrink-0 h-7 sm:h-9 px-0.5 rounded-lg hover:bg-white/[0.06] transition-all cursor-pointer"
            title="Guardar y volver a la tienda principal"
          >
            <img
              src="/images/rgodbeat-studio-logo.png"
              alt="RGodbeat Studio"
              className="h-5 sm:h-7 w-auto max-w-[70px] xs:max-w-[85px] sm:max-w-[125px] object-contain filter brightness-125 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] group-hover:scale-105 transition-all duration-200"
            />
          </Link>
        </div>

        {/* CENTER ZONE: 4 Centered Buttons (View Switchers are LARGER in the center, Beat and Options symmetrical & square) */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-3 flex-1 min-w-0 px-0.5 sm:px-2">
          {/* Button 1 (Opción Izquierda): Beat Selector (Mismo tamaño cuadrado que el de Opciones) */}
          <button
            type="button"
            onClick={onOpenLoadBeat}
            className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-850 cursor-pointer transition-all shadow-sm shrink-0 active:scale-95"
            title={`Beat: ${currentBeatTitle || 'Beat actual'}. Clic para cambiar beat o cargar audio`}
          >
            <Music className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
          </button>

          {/* VIEW SWITCHER CLUSTER: MÁS GRANDE Y OCUPANDO EL CENTRO */}
          <div className="flex-1 max-w-[340px] sm:max-w-[440px] h-10 sm:h-11 flex items-center bg-zinc-900/95 p-1 rounded-2xl border border-zinc-800 shadow-inner gap-1 min-w-0">
            {/* Button 2: Ventana Principal (Grabador) */}
            <button
              type="button"
              onClick={() => onChangeView('studio')}
              className={`flex-1 h-full px-1 sm:px-4 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl text-xs sm:text-sm font-mono font-bold transition-all cursor-pointer min-w-0 ${
                activeView === 'studio'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/25 font-black scale-[1.02]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
              }`}
              title="Ventana Principal: Grabador & Reproductor"
            >
              <Disc3 className="hidden sm:block w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
              <span className="font-bold whitespace-nowrap text-[11px] sm:text-xs">Grabador</span>
            </button>

            {/* Button 3: Ventana de Edición (Multitrack) */}
            <button
              type="button"
              onClick={() => onChangeView('editor')}
              className={`flex-1 h-full px-1 sm:px-4 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl text-xs sm:text-sm font-mono font-bold transition-all cursor-pointer relative min-w-0 ${
                activeView === 'editor'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/25 font-black scale-[1.02]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
              }`}
              title="Ventana de Edición: Multitrack & Tomas"
            >
              <Layers className="hidden sm:block w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
              <span className="font-bold whitespace-nowrap text-[11px] sm:text-xs">Edición</span>
              {hasRecordings && (
                <span className="hidden sm:block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              )}
            </button>
          </div>

          {/* Button 4 (Opción Derecha): Proyecto Dropdown (Mismo tamaño cuadrado que el de Beat) */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowProjectMenu(!showProjectMenu)}
              className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-850 text-zinc-300 hover:text-white transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
              title="Opciones de Proyecto (Guardar en Nube, Archivo, Nuevo)"
            >
              <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
            </button>

            {/* Dropdown Menu Box */}
            {showProjectMenu && (
              <div className="absolute left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-0 mt-2 w-56 rounded-2xl bg-[#0e0e14] border border-zinc-700/80 shadow-2xl z-50 p-2 space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
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
                    <span>{isLoadingCloud ? 'Cargando...' : 'Abrir espacio 1'}<span className="block max-w-52 truncate text-zinc-400">{cloudSlots?.find(slot => slot.slot === 'active')?.name}</span></span>
                  </button>
                )}

                {hasPreviousCloudProject && onLoadPreviousCloudProject && (
                  <button
                    onClick={() => {
                      setShowProjectMenu(false);
                      onLoadPreviousCloudProject();
                    }}
                    disabled={isLoadingCloud}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-sky-300 hover:bg-sky-500/15 transition-all text-left cursor-pointer"
                  >
                    {isLoadingCloud ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4 text-sky-400" />}
                    <span>{isLoadingCloud ? 'Cargando...' : 'Abrir espacio 2'}<span className="block max-w-52 truncate text-zinc-400">{cloudSlots?.find(slot => slot.slot === 'previous')?.name}</span></span>
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
        </div>

        {/* RIGHT ZONE: Login / Account Pill at Far Right */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Subtle Undo / Redo for quick correction (desktop only) */}
          <div className="hidden xl:flex items-center bg-zinc-900/90 p-0.5 rounded-lg border border-zinc-800 shrink-0">
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

          {/* Account / Login Pill Button (Shows Days Remaining & Prevents Multiple Logins) */}
          {isUserLoggedIn ? (
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-mono font-medium bg-zinc-900 text-zinc-200 border border-emerald-500/40 hover:border-emerald-400 transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
                title={`Cuenta activa: ${accessStatus?.email || 'Conectado'} (${daysText})`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-emerald-300 whitespace-nowrap">
                  {daysText}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500 hidden sm:inline" />
              </button>

              {/* Account Dropdown Menu */}
              {showAccountMenu && (
                <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-[#0e0e14] border border-zinc-700/80 shadow-2xl z-50 p-3 space-y-3 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold text-xs shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono font-bold text-white truncate">
                        {accessStatus?.email || 'Usuario Conectado'}
                      </p>
                      <p className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 font-semibold mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span className="truncate">{daysText.includes('día') ? `${daysText} restantes` : daysText}</span>
                      </p>
                    </div>
                  </div>

                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountMenu(false);
                        onLogout();
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-mono font-bold bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-500/40 hover:border-red-400 transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-400" />
                      <span>Cerrar Sesión</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            onOpenUnlockModal && (
              <button
                type="button"
                onClick={onOpenUnlockModal}
                className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-xs font-mono font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 hover:border-amber-400 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                title="Iniciar Sesión en RGODBEAT Studio"
              >
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xs:inline">Iniciar Sesión</span>
                <span className="xs:hidden">Login</span>
              </button>
            )
          )}
        </div>
      </header>
    </>
  );
};
