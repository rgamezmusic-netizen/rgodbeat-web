import React, { useState, useEffect } from 'react';
import {
  X,
  Share,
  PlusSquare,
  MoreVertical,
  Download,
  Laptop,
  ArrowRight,
  Sparkles,
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
  const [activeOs, setActiveOs] = useState<PlatformType>('ios');
  const [detectedOs, setDetectedOs] = useState<PlatformType>('ios');
  const [activeStep, setActiveStep] = useState<number>(1);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Capture PWA installation prompt if available (Android Chrome / Edge / Windows)
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Auto-detect Operating System on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      setActiveOs('ios');
      setDetectedOs('ios');
    } else if (/Android/i.test(ua)) {
      setActiveOs('android');
      setDetectedOs('android');
    } else if (/Windows|Win32|Win64/i.test(ua)) {
      setActiveOs('windows');
      setDetectedOs('windows');
    } else if (/Macintosh/i.test(ua)) {
      // Mac desktop: Safari-compatible flow
      setActiveOs('ios');
      setDetectedOs('ios');
    } else {
      setActiveOs('android');
      setDetectedOs('android');
    }
  }, []);

  // Reset to step 1 whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveStep(1);
    }
  }, [isOpen]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Format detected device label cleanly
  const getDeviceLabel = () => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || '';
      if (/iPad/i.test(ua)) return 'iPad · Safari';
      if (/iPhone|iPod/i.test(ua)) return 'iPhone · Safari';
      if (/Android/i.test(ua)) return 'Android · Chrome';
      if (/Windows/i.test(ua)) return 'Windows · Chrome / Edge';
    }
    if (activeOs === 'ios') return 'iPhone · Safari';
    if (activeOs === 'android') return 'Android · Chrome';
    return 'Windows · Chrome / Edge';
  };

  const handleNext = () => {
    if (activeStep < 3) {
      setActiveStep((prev) => prev + 1);
    } else {
      // Step 3 final CTA
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(() => {
            onClose();
          });
        } catch {
          onClose();
        }
      } else {
        onClose();
      }
    }
  };

  // Content configuration for each platform
  const getStepContent = () => {
    if (activeOs === 'ios') {
      switch (activeStep) {
        case 1:
          return {
            num: '01',
            title: 'Abre Compartir',
            desc: 'Toca el botón Compartir de Safari.',
          };
        case 2:
          return {
            num: '02',
            title: 'Agregar a Inicio',
            desc: 'Selecciona ‘Agregar a Inicio’.',
          };
        case 3:
        default:
          return {
            num: '03',
            title: 'Listo.',
            desc: 'Abre RGODBEAT desde tu pantalla de inicio.',
          };
      }
    }

    if (activeOs === 'android') {
      switch (activeStep) {
        case 1:
          return {
            num: '01',
            title: 'Menú de Opciones',
            desc: 'Toca los tres puntos (⋮) en la esquina de Chrome.',
          };
        case 2:
          return {
            num: '02',
            title: 'Instalar Aplicación',
            desc: 'Selecciona ‘Instalar aplicación’ o ‘Agregar a inicio’.',
          };
        case 3:
        default:
          return {
            num: '03',
            title: 'Listo.',
            desc: 'Abre RGODBEAT desde tu pantalla de inicio.',
          };
      }
    }

    // Windows / Desktop
    switch (activeStep) {
      case 1:
        return {
          num: '01',
          title: 'Barra de Direcciones',
          desc: 'Busca el icono de instalar (⊕) en la barra de Chrome o Edge.',
        };
      case 2:
        return {
          num: '02',
          title: 'Instalar RGODBEAT',
          desc: 'Haz clic en ‘Instalar’ para fijar en tu barra de tareas.',
        };
      case 3:
      default:
        return {
          num: '03',
          title: 'Listo.',
          desc: 'Abre RGODBEAT desde tu escritorio o barra de tareas.',
        };
    }
  };

  const currentStep = getStepContent();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-opacity duration-300"
      onClick={onClose}
    >
      {/* Modal Card */}
      <div
        className="relative w-full max-w-[390px] bg-[#0c0d12] border border-white/[0.08] rounded-3xl p-6 sm:p-7 shadow-[0_0_50px_-15px_rgba(245,158,11,0.15)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle orange ambient glow in background */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Cerrar"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center">
          {/* Small RGODBEAT Icon */}
          <div className="w-10 h-10 rounded-xl bg-black border border-white/[0.08] shadow-inner p-1.5 flex items-center justify-center mb-3">
            <img
              src="/images/rgodbeat-studio-logo.png"
              alt="RGODBEAT"
              className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]"
            />
          </div>

          {/* Title */}
          <h2 className="text-base font-bold text-white tracking-wider uppercase font-mono">
            INSTALA RGODBEAT
          </h2>

          {/* Subtitle */}
          <p className="text-xs text-zinc-400 mt-0.5">
            Tu estudio, como una app.
          </p>

          {/* Detected Device Only */}
          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-zinc-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span>{getDeviceLabel()}</span>
          </div>
        </div>

        {/* Step Progress Indicators */}
        <div className="flex items-center justify-center gap-1.5 my-5">
          {[1, 2, 3].map((stepNum) => (
            <div
              key={stepNum}
              className={`h-1 rounded-full transition-all duration-300 ${
                stepNum === activeStep
                  ? 'w-7 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                  : stepNum < activeStep
                  ? 'w-3.5 bg-amber-500/40'
                  : 'w-3.5 bg-zinc-800'
              }`}
            />
          ))}
        </div>

        {/* Step Info */}
        <div className="text-center space-y-1 mb-4">
          <div className="text-[11px] font-mono font-bold text-amber-400 tracking-wider">
            {currentStep.num}
          </div>
          <h3 className="text-base font-bold text-white">
            {currentStep.title}
          </h3>
          <p className="text-xs text-zinc-400">
            {currentStep.desc}
          </p>
        </div>

        {/* Visual Illustration per Step */}
        <div className="mb-6">
          {activeOs === 'ios' && (
            <>
              {/* iOS Step 1: Safari Toolbar with Highlighted Share Button */}
              {activeStep === 1 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="w-full max-w-[270px] h-12 rounded-xl bg-zinc-900/90 border border-white/[0.08] px-4 flex items-center justify-between shadow-lg relative">
                    {/* Safari Left Controls */}
                    <div className="flex items-center gap-3 text-zinc-600">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                      </svg>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    {/* Safari Share Button (Highlighted) */}
                    <div className="relative flex flex-col items-center">
                      <div className="absolute -top-5 animate-bounce text-amber-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500 text-black shadow-[0_0_18px_rgba(245,158,11,0.5)]">
                        <Share className="w-4 h-4 stroke-[2.4]" />
                      </div>
                    </div>

                    {/* Safari Right Controls */}
                    <div className="flex items-center gap-3 text-zinc-600">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <div className="w-3.5 h-3.5 rounded-sm border-2 border-zinc-600" />
                    </div>
                  </div>
                </div>
              )}

              {/* iOS Step 2: Share Sheet with Highlighted 'Agregar a Inicio' */}
              {activeStep === 2 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-2.5 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="w-full max-w-[270px] space-y-1.5">
                    <div className="h-6 rounded-lg bg-zinc-900/40 border border-white/[0.04] px-3 flex items-center justify-between opacity-30">
                      <span className="text-[10px] text-zinc-400">Copiar enlace</span>
                    </div>

                    <div className="h-10 rounded-xl bg-amber-500/15 border border-amber-500/50 px-3 flex items-center justify-between shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                          <PlusSquare className="w-3.5 h-3.5 stroke-[2.2]" />
                        </div>
                        <span className="text-xs font-semibold text-amber-300">
                          Agregar a Inicio
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-black shadow-sm">
                        Tocar
                      </span>
                    </div>

                    <div className="h-6 rounded-lg bg-zinc-900/40 border border-white/[0.04] px-3 flex items-center justify-between opacity-30">
                      <span className="text-[10px] text-zinc-400">Guardar en marcadores</span>
                    </div>
                  </div>
                </div>
              )}

              {/* iOS Step 3: iPhone Home Screen with RGODBEAT Icon Glowing */}
              {activeStep === 3 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="flex items-center justify-center gap-5">
                    <div className="flex flex-col items-center gap-1 opacity-25">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700" />
                      <span className="text-[9px] text-zinc-500">Música</span>
                    </div>

                    <div className="flex flex-col items-center gap-1 relative scale-105">
                      <div className="absolute -inset-1.5 bg-amber-500/30 rounded-2xl blur-md animate-pulse" />
                      <div className="relative w-11 h-11 rounded-xl bg-black border-2 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.4)] flex items-center justify-center overflow-hidden p-1.5">
                        <img
                          src="/images/rgodbeat-studio-logo.png"
                          alt="RGODBEAT"
                          className="w-full h-full object-contain filter drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                        />
                      </div>
                      <span className="text-[10px] font-bold text-amber-300 tracking-tight">
                        RGODBEAT
                      </span>
                    </div>

                    <div className="flex flex-col items-center gap-1 opacity-25">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700" />
                      <span className="text-[9px] text-zinc-500">Safari</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeOs === 'android' && (
            <>
              {/* Android Step 1: Chrome Address Bar with 3 dots */}
              {activeStep === 1 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="w-full max-w-[270px] h-11 rounded-xl bg-zinc-900 border border-white/[0.08] px-3 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 bg-zinc-950 px-2 py-1 rounded-md flex-1 mr-2 truncate font-mono">
                      <span className="text-emerald-400">🔒</span>
                      <span>rgodbeat.com</span>
                    </div>
                    <div className="relative flex items-center justify-center">
                      <div className="absolute -top-5 animate-bounce text-amber-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                      <div className="p-1.5 rounded-lg bg-amber-500 text-black shadow-[0_0_16px_rgba(245,158,11,0.5)]">
                        <MoreVertical className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Android Step 2: Chrome Menu with Install Option */}
              {activeStep === 2 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-2.5 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="w-full max-w-[270px] space-y-1.5">
                    <div className="h-6 rounded-lg bg-zinc-900/40 border border-white/[0.04] px-3 flex items-center opacity-30">
                      <span className="text-[10px] text-zinc-400">Nueva pestaña</span>
                    </div>
                    <div className="h-10 rounded-xl bg-amber-500/15 border border-amber-500/50 px-3 flex items-center justify-between shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                          <Download className="w-3.5 h-3.5 stroke-[2.2]" />
                        </div>
                        <span className="text-xs font-semibold text-amber-300">
                          Instalar aplicación
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-black shadow-sm">
                        Tocar
                      </span>
                    </div>
                    <div className="h-6 rounded-lg bg-zinc-900/40 border border-white/[0.04] px-3 flex items-center opacity-30">
                      <span className="text-[10px] text-zinc-400">Sitio para computadoras</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Android Step 3: Home Screen */}
              {activeStep === 3 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="flex items-center justify-center gap-5">
                    <div className="flex flex-col items-center gap-1 opacity-25">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700" />
                      <span className="text-[9px] text-zinc-500">Play Store</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 relative scale-105">
                      <div className="absolute -inset-1.5 bg-amber-500/30 rounded-2xl blur-md animate-pulse" />
                      <div className="relative w-11 h-11 rounded-xl bg-black border-2 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.4)] flex items-center justify-center overflow-hidden p-1.5">
                        <img
                          src="/images/rgodbeat-studio-logo.png"
                          alt="RGODBEAT"
                          className="w-full h-full object-contain filter drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                        />
                      </div>
                      <span className="text-[10px] font-bold text-amber-300 tracking-tight">
                        RGODBEAT
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-1 opacity-25">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700" />
                      <span className="text-[9px] text-zinc-500">Chrome</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeOs === 'windows' && (
            <>
              {/* Windows Step 1: URL bar with install icon */}
              {activeStep === 1 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="w-full max-w-[290px] h-11 rounded-xl bg-zinc-900 border border-white/[0.08] px-3 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 bg-zinc-950 px-2 py-1 rounded-md flex-1 mr-2 truncate font-mono">
                      <span className="text-emerald-400">🔒</span>
                      <span>https://rgodbeat.com</span>
                    </div>
                    <div className="relative flex items-center justify-center">
                      <div className="absolute -top-5 animate-bounce text-amber-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-500 text-black font-bold text-[10px] shadow-[0_0_16px_rgba(245,158,11,0.5)]">
                        <Laptop className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Instalar</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Windows Step 2: Confirm Dialog */}
              {activeStep === 2 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="w-full max-w-[270px] p-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] space-y-2 shadow-lg">
                    <div className="flex items-center gap-2">
                      <img
                        src="/images/rgodbeat-studio-logo.png"
                        alt="Logo"
                        className="w-5 h-5 rounded-md object-contain bg-black p-0.5"
                      />
                      <span className="text-[11px] font-bold text-white font-mono">
                        ¿Instalar RGODBEAT?
                      </span>
                    </div>
                    <div className="flex justify-end gap-2 pt-1 border-t border-zinc-800">
                      <span className="text-[10px] text-zinc-500 self-center">Cancelar</span>
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-500 text-black font-bold text-[10px] shadow-sm">
                        Instalar
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Windows Step 3: Desktop Standalone */}
              {activeStep === 3 && (
                <div className="h-28 rounded-2xl bg-zinc-950/70 border border-white/[0.06] p-3 flex flex-col justify-center items-center relative overflow-hidden">
                  <div className="flex flex-col items-center gap-1 relative scale-105">
                    <div className="absolute -inset-1.5 bg-amber-500/30 rounded-2xl blur-md animate-pulse" />
                    <div className="relative w-11 h-11 rounded-xl bg-black border-2 border-amber-400/80 shadow-[0_0_20px_rgba(245,158,11,0.4)] flex items-center justify-center overflow-hidden p-1.5">
                      <img
                        src="/images/rgodbeat-studio-logo.png"
                        alt="RGODBEAT"
                        className="w-full h-full object-contain filter drop-shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-amber-300 tracking-tight">
                      RGODBEAT Studio
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Controls: Only ONE Primary CTA Button */}
        <div className="space-y-2 mt-auto">
          <button
            type="button"
            onClick={handleNext}
            className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-mono font-bold text-xs uppercase tracking-wider shadow-[0_0_25px_-5px_rgba(245,158,11,0.4)] transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>
              {activeStep === 3
                ? deferredPrompt
                  ? 'INSTALAR AHORA →'
                  : 'ABRIR RGODBEAT →'
                : 'SIGUIENTE →'}
            </span>
          </button>

          {/* Discreet Back Navigation (If Step > 1) */}
          {activeStep > 1 && (
            <button
              type="button"
              onClick={() => setActiveStep((prev) => Math.max(1, prev - 1))}
              className="w-full py-1 text-center text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              ← Paso anterior
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

