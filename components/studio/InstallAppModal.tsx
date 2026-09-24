import React, { useState } from 'react';
import { X, Smartphone, Check } from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({ isOpen, onClose }) => {
  const [activeOs, setActiveOs] = useState<'android' | 'ios'>('android');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#0e0e14] border border-amber-500/30 rounded-2xl shadow-2xl p-5 sm:p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold font-mono text-white uppercase tracking-wider">
                INSTALAR COMO APP EN TU MÓVIL
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                Pantalla completa, cero barras y rendimiento nativo.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* OS Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-900/90 rounded-xl border border-zinc-800 mb-5">
          <button
            type="button"
            onClick={() => setActiveOs('android')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeOs === 'android'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>🤖 Android (Chrome/Samsung)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveOs('ios')}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-mono font-bold transition-all ${
              activeOs === 'ios'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <span>🍏 iPhone / iPad (Safari)</span>
          </button>
        </div>

        {/* Tab 1: Android Instructions */}
        {activeOs === 'android' && (
          <div className="space-y-3.5 text-xs font-mono">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </span>
              <div>
                <p className="text-white font-semibold">Abre Google Chrome o Samsung Internet</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Entra a <span className="text-amber-300">rgodbeat.com/studio</span> desde tu navegador.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-bold shrink-0">
                2
              </span>
              <div>
                <p className="text-white font-semibold">Toca los tres puntos (⋮)</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Están ubicados en la esquina superior derecha de Google Chrome.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-bold shrink-0">
                3
              </span>
              <div>
                <p className="text-white font-semibold">Selecciona "Instalar aplicación"</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  En algunos modelos aparece como <em>"Agregar a la pantalla principal"</em>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">¡Listo! Toca "Instalar"</p>
                <p className="text-[11px] text-emerald-400/80 mt-0.5">
                  RGODBEAT Studio se guardará con su ícono oficial en tus aplicaciones y abrirá a pantalla completa.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: iOS Instructions */}
        {activeOs === 'ios' && (
          <div className="space-y-3.5 text-xs font-mono">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </span>
              <div>
                <p className="text-white font-semibold">Abre Safari</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Ingresa a <span className="text-amber-300">rgodbeat.com/studio</span> exclusivamente desde Safari de Apple.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-bold shrink-0">
                2
              </span>
              <div>
                <p className="text-white font-semibold">Toca el botón Compartir</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Es el ícono del cuadrado con la flecha hacia arriba en la barra inferior de Safari.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center text-xs font-bold shrink-0">
                3
              </span>
              <div>
                <p className="text-white font-semibold">Toca "Agregar a pantalla de inicio"</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Desliza un poco hacia abajo en el menú de compartir hasta ver la opción con el signo <strong>(+)</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">¡Listo! Toca "Agregar"</p>
                <p className="text-[11px] text-emerald-400/80 mt-0.5">
                  La app se añadirá a tu pantalla de inicio junto a tus otras aplicaciones.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-zinc-800/80 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
