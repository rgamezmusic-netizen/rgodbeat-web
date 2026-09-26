import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Monitor,
  Share,
  PlusSquare,
  MoreVertical,
  Download,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Laptop,
  Check
} from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  isFirstVisitWelcome?: boolean;
}

type PlatformType = 'ios' | 'android' | 'windows';

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  isFirstVisitWelcome = false,
}) => {
  const [activeOs, setActiveOs] = useState<PlatformType>('android');
  const [detectedOs, setDetectedOs] = useState<PlatformType>('android');
  const [activeStep, setActiveStep] = useState<number>(1);

  // Auto-detect Operating System and Browser on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      setActiveOs('ios');
      setDetectedOs('ios');
    } else if (/Windows|Win32|Win64/i.test(ua)) {
      setActiveOs('windows');
      setDetectedOs('windows');
    } else if (/Android/i.test(ua)) {
      setActiveOs('android');
      setDetectedOs('android');
    } else if (/Macintosh/i.test(ua)) {
      setActiveOs('ios');
      setDetectedOs('ios');
    } else {
      setActiveOs('android');
      setDetectedOs('android');
    }
  }, []);

  // Reset step to 1 when changing OS tab
  const handleSelectOs = (os: PlatformType) => {
    setActiveOs(os);
    setActiveStep(1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl bg-[#0c0d12] border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="absolute top-0 right-1/4 w-80 h-32 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/90 px-4 sm:px-6 py-3.5 bg-zinc-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/40 text-amber-300 shadow-sm">
              <Smartphone className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-bold font-mono text-white uppercase tracking-wider">
                  CÓMO INSTALAR RGODBEAT APP
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-[9px] font-mono font-bold text-amber-300 uppercase">
                  PWA Pro
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] font-mono text-zinc-400">
                Experiencia 100% nativa: pantalla completa sin barra de navegación y cero latencia.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Cerrar y entrar al estudio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Device Detection Banner & OS Selector */}
        <div className="p-4 sm:p-5 pb-2 shrink-0 space-y-3">
          {/* Detected Device Chip */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-[11px] font-mono">
            <div className="flex items-center gap-2 text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Dispositivo detectado:</span>
              <strong className="text-emerald-400 font-semibold">
                {detectedOs === 'ios' && '🍏 iPhone / iPad (Safari)'}
                {detectedOs === 'android' && '🤖 Android (Google Chrome)'}
                {detectedOs === 'windows' && '💻 Windows (Edge / Chrome)'}
              </strong>
            </div>
            <span className="text-[10px] text-amber-400/90 font-medium hidden sm:inline">
              Guía interactiva paso a paso
            </span>
          </div>

          {/* OS Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-900/90 rounded-xl border border-zinc-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => handleSelectOs('ios')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-bold transition-all text-[11px] sm:text-xs ${
                activeOs === 'ios'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <span>🍏 iPhone (Safari)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectOs('android')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-bold transition-all text-[11px] sm:text-xs ${
                activeOs === 'android'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <span>🤖 Android (Chrome)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectOs('windows')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-bold transition-all text-[11px] sm:text-xs ${
                activeOs === 'windows'
                  ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              <span>💻 Windows (Edge/PC)</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto px-4 sm:px-6 py-2 space-y-4">
          {/* Visual Step Simulation / Interactive Screen Tour */}
          <div className="rounded-xl border border-zinc-800 bg-[#08080c] p-3 sm:p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Simulación Visual: Dónde debes presionar
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((stepNum) => (
                  <button
                    key={stepNum}
                    type="button"
                    onClick={() => setActiveStep(stepNum)}
                    className={`w-6 h-6 rounded-md text-[10px] font-mono font-bold transition-all ${
                      activeStep === stepNum
                        ? 'bg-amber-500 text-black shadow-sm'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {stepNum}
                  </button>
                ))}
              </div>
            </div>

            {/* TAB 1: IPHONE (SAFARI & CHROME) TOUR */}
            {activeOs === 'ios' && (
              <div className="space-y-3">
                {/* Banner explaining that Home Screen removes the bottom browser bar */}
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-emerald-500/10 border border-amber-500/40 text-[11px] font-mono flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-300 font-bold">¡Elimina la barra inferior del explorador!</strong>
                    <p className="text-zinc-300 text-[10px] mt-0.5 leading-relaxed">
                      Al instalar el acceso en tu pantalla de inicio y abrirlo desde allí, <strong>la barra inferior con la URL y botones del explorador desaparece al 100%</strong>. Se ejecuta a pantalla completa como una App nativa.
                    </p>
                  </div>
                </div>

                {activeStep === 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 1:</strong> En la barra inferior de <strong>Safari</strong> o <strong>Chrome</strong> en tu iPhone, presiona el botón{' '}
                      <span className="text-amber-300 font-bold">Compartir</span> (el cuadrado con la flecha arriba) o los <span className="text-amber-300 font-bold">tres puntos (...)</span>.
                    </p>
                    {/* Visual Mockup of Safari / Chrome Bottom Bar */}
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between max-w-sm mx-auto shadow-lg relative overflow-hidden">
                      <div className="text-zinc-600 text-xs">‹</div>
                      <div className="text-zinc-600 text-xs">❐</div>
                      {/* Highlighted Beacon Button */}
                      <div className="relative group">
                        <div className="absolute -inset-2 bg-amber-500/40 rounded-xl blur animate-pulse" />
                        <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold text-xs shadow-lg animate-bounce">
                          <Share className="w-4 h-4 stroke-[2.5]" />
                          <span>Toca Compartir / ...</span>
                        </div>
                      </div>
                      <div className="text-zinc-600 text-xs">↻</div>
                      <div className="text-zinc-600 text-xs">•••</div>
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 2:</strong> En la lista de opciones que aparece, baja un poco y presiona{' '}
                      <span className="text-amber-300 font-bold">"Agregar a inicio"</span>.
                    </p>
                    {/* Visual Mockup of Safari Action Sheet */}
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 max-w-sm mx-auto space-y-1.5">
                      <div className="px-3 py-1.5 rounded-md bg-zinc-800/40 text-zinc-500 text-[11px] font-mono flex items-center justify-between">
                        <span>Copiar enlace</span>
                      </div>
                      <div className="relative">
                        <div className="absolute -inset-1 bg-amber-500/30 rounded-lg blur animate-pulse" />
                        <div className="relative px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-mono font-bold flex items-center justify-between shadow-sm">
                          <span className="flex items-center gap-2">
                            <PlusSquare className="w-4 h-4 text-amber-400" />
                            Agregar a inicio
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold">
                            Tocar
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-1.5 rounded-md bg-zinc-800/40 text-zinc-500 text-[11px] font-mono flex items-center justify-between">
                        <span>Agregar a marcadores</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 3:</strong> En la esquina superior derecha de tu pantalla, presiona{' '}
                      <span className="text-amber-300 font-bold">"Agregar"</span>.
                    </p>
                    {/* Visual Mockup of Add Modal Top Bar */}
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 max-w-sm mx-auto flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-400">Cancelar</span>
                      <span className="text-xs font-mono font-bold text-white">RGODBEAT Studio</span>
                      <div className="relative">
                        <div className="absolute -inset-1.5 bg-amber-500/40 rounded-lg blur animate-pulse" />
                        <button
                          type="button"
                          className="relative px-3 py-1 rounded-md bg-amber-500 text-black font-mono font-bold text-xs shadow-md animate-pulse"
                        >
                          Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ANDROID (GOOGLE CHROME) TOUR */}
            {activeOs === 'android' && (
              <div className="space-y-3">
                {activeStep === 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 1:</strong> En la esquina superior derecha de <strong>Google Chrome</strong> o Samsung Internet, toca los{' '}
                      <span className="text-amber-300 font-bold">tres puntos (⋮)</span>.
                    </p>
                    {/* Visual Mockup of Chrome Address Bar */}
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between max-w-sm mx-auto shadow-lg">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2.5 py-1 rounded-md flex-1 mr-2 truncate">
                        <span className="text-emerald-400">🔒</span>
                        <span>rgodbeat.com/studio</span>
                      </div>
                      {/* Highlighted 3 dots button */}
                      <div className="relative">
                        <div className="absolute -inset-1 bg-amber-500/40 rounded-lg blur animate-pulse" />
                        <div className="relative flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 text-black font-mono font-bold text-xs shadow-md animate-bounce">
                          <MoreVertical className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Toca aquí</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 2:</strong> En el menú desplegable, busca y toca{' '}
                      <span className="text-amber-300 font-bold">"Instalar aplicación"</span> o{' '}
                      <span className="text-amber-300 font-bold">"Agregar a la pantalla principal"</span>.
                    </p>
                    {/* Visual Mockup of Chrome Menu */}
                    <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 max-w-sm mx-auto space-y-1">
                      <div className="px-3 py-1 rounded text-zinc-500 text-[11px] font-mono">Pestaña nueva</div>
                      <div className="relative">
                        <div className="absolute -inset-1 bg-amber-500/30 rounded-lg blur animate-pulse" />
                        <div className="relative px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-mono font-bold flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Download className="w-4 h-4 text-amber-400" />
                            Instalar aplicación
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold">
                            Tocar
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-1 rounded text-zinc-500 text-[11px] font-mono">Sitio para computadoras</div>
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 3:</strong> En la ventana de confirmación, presiona{' '}
                      <span className="text-amber-300 font-bold">"Instalar"</span>.
                    </p>
                    {/* Visual Mockup of Android confirmation dialog */}
                    <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 max-w-sm mx-auto space-y-3">
                      <div className="flex items-center gap-3">
                        <img
                          src="/images/rgodbeat-studio-logo.png"
                          alt="Icon"
                          className="w-8 h-8 rounded-lg object-contain bg-black p-0.5"
                        />
                        <div>
                          <p className="text-xs font-mono font-bold text-white">¿Instalar RGODBEAT Studio?</p>
                          <p className="text-[10px] text-zinc-400 font-mono">rgodbeat.com</p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1 border-t border-zinc-800">
                        <span className="px-2 py-1 text-xs font-mono text-zinc-400">Cancelar</span>
                        <div className="relative">
                          <div className="absolute -inset-1 bg-amber-500/40 rounded-lg blur animate-pulse" />
                          <button
                            type="button"
                            className="relative px-3 py-1 rounded-md bg-amber-500 text-black font-mono font-bold text-xs shadow-md animate-pulse"
                          >
                            Instalar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: WINDOWS (MICROSOFT EDGE / CHROME / PC) TOUR */}
            {activeOs === 'windows' && (
              <div className="space-y-3">
                {activeStep === 1 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 1:</strong> En la barra de direcciones de <strong>Microsoft Edge</strong> o <strong>Chrome</strong> en Windows, busca el icono{' '}
                      <span className="text-amber-300 font-bold">"Instalar aplicación" (⊕)</span> al lado de la estrella de favoritos.
                    </p>
                    {/* Visual Mockup of Edge/Chrome Windows URL Bar */}
                    <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between max-w-md mx-auto shadow-lg">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 bg-zinc-950 px-2.5 py-1.5 rounded-md flex-1 mr-2 truncate">
                        <span className="text-emerald-400">🔒</span>
                        <span>https://rgodbeat.com/studio</span>
                      </div>
                      {/* Highlighted Install icon in Edge */}
                      <div className="relative">
                        <div className="absolute -inset-1 bg-amber-500/40 rounded-lg blur animate-pulse" />
                        <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 text-black font-mono font-bold text-xs shadow-md animate-bounce">
                          <Laptop className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Instalar App ⊕</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 2:</strong> Si no ves el botón en la barra, ve al menú{' '}
                      <span className="text-amber-300 font-bold">⋯ (Configuración)</span> →{' '}
                      <span className="text-amber-300 font-bold">Aplicaciones</span> →{' '}
                      <span className="text-amber-300 font-bold">"Instalar este sitio como una aplicación"</span>.
                    </p>
                    {/* Visual Mockup of Windows Edge Menu */}
                    <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 max-w-sm mx-auto space-y-1">
                      <div className="px-3 py-1 rounded text-zinc-500 text-[11px] font-mono">Zoom (100%)</div>
                      <div className="relative">
                        <div className="absolute -inset-1 bg-amber-500/30 rounded-lg blur animate-pulse" />
                        <div className="relative px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/60 text-amber-300 text-xs font-mono font-bold flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Monitor className="w-4 h-4 text-amber-400" />
                            Aplicaciones → Instalar RGODBEAT
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-black font-bold">
                            Clic
                          </span>
                        </div>
                      </div>
                      <div className="px-3 py-1 rounded text-zinc-500 text-[11px] font-mono">Historial y Descargas</div>
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-zinc-200">
                      <strong>Paso 3:</strong> En la ventana de Microsoft Edge, haz clic en{' '}
                      <span className="text-amber-300 font-bold">"Instalar"</span>. ¡Se abrirá en su propia ventana sin marcos!
                    </p>
                    {/* Visual Mockup of Windows Confirmation */}
                    <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 max-w-sm mx-auto space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-xs font-mono">
                          RG
                        </div>
                        <div>
                          <p className="text-xs font-mono font-bold text-white">Instalar RGODBEAT Studio</p>
                          <p className="text-[10px] text-zinc-400 font-mono">Anclar a la barra de tareas e inicio</p>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1 border-t border-zinc-800">
                        <span className="px-2 py-1 text-xs font-mono text-zinc-400">No</span>
                        <div className="relative">
                          <div className="absolute -inset-1 bg-amber-500/40 rounded-lg blur animate-pulse" />
                          <button
                            type="button"
                            className="relative px-3.5 py-1 rounded-md bg-amber-500 text-black font-mono font-bold text-xs shadow-md animate-pulse"
                          >
                            Instalar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Next / Previous step controller */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                disabled={activeStep <= 1}
                onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
                className={`text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg transition-all ${
                  activeStep <= 1
                    ? 'text-zinc-600 cursor-not-allowed'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                ← Paso anterior
              </button>

              <span className="text-[11px] font-mono text-zinc-500">
                Paso {activeStep} de 3
              </span>

              {activeStep < 3 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep((prev) => Math.min(3, prev + 1))}
                  className="text-[11px] font-mono font-bold px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 transition-all flex items-center gap-1"
                >
                  <span>Siguiente paso</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : (
                <span className="text-[11px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  ¡Guía completada!
                </span>
              )}
            </div>
          </div>

          {/* Quick Advantages List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-zinc-200">Grabación sin interrupciones</strong>
                <p className="text-zinc-400 text-[10px]">
                  Evita que las barras del navegador tapen la línea de tiempo o el botón REC.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-zinc-200">Acceso Rápido desde tu Inicio</strong>
                <p className="text-zinc-400 text-[10px]">
                  Abre directo como cualquier aplicación instalada en tu teléfono o PC.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Big Action Button */}
        <div className="p-4 sm:p-5 border-t border-zinc-800/90 bg-zinc-950/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[10px] font-mono text-zinc-400 text-center sm:text-left">
            Puedes abrir esta guía en cualquier momento desde el botón{' '}
            <strong className="text-zinc-200">📁 Proyecto → Instalar como App</strong>.
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/25 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>⚡ Entrar al Estudio Ahora</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
