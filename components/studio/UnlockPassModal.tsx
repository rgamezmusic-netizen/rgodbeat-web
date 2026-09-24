import React, { useState } from 'react';
import { X, Sparkles, Check, Flame, Disc, ShieldCheck, ArrowRight, Loader2, LogIn, User } from 'lucide-react';

interface UnlockPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'export' | 'tracks' | 'general';
  userEmail?: string | null;
}

export const UnlockPassModal: React.FC<UnlockPassModalProps> = ({
  isOpen,
  onClose,
  reason = 'general',
  userEmail,
}) => {
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBuyPass = async () => {
    try {
      setIsLoadingCheckout(true);
      setErrorMsg(null);

      const res = await fetch('/api/studio/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/login?redirect=/studio`;
          return;
        }
        throw new Error(data.error || 'Error al iniciar checkout.');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'No se pudo conectar a la pasarela de pago.');
    } finally {
      setIsLoadingCheckout(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0d0c12] border border-amber-500/30 rounded-2xl shadow-[0_0_50px_rgba(245,158,11,0.15)] overflow-hidden">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-zinc-800/80 flex items-start justify-between relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-mono tracking-[0.2em] text-amber-400 uppercase font-bold">
                PASES & SUSCRIPCIÓN // RGODBEAT STUDIO
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-sans text-white uppercase tracking-tight">
              {reason === 'export'
                ? 'DESBLOQUEA LA EXPORTACIÓN EN MASTER WAV'
                : reason === 'tracks'
                ? 'DESBLOQUEA LAS 4 PISTAS VOCALES'
                : 'ACTIVA TU ACCESO COMPLETO AL STUDIO'}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              {reason === 'export'
                ? 'En Modo Demo la exportación está restringida. Activa tu pase para descargar tu mezcla sin pérdidas en 24-bit / 48kHz.'
                : reason === 'tracks'
                ? 'El Modo Demo permite grabar 1 pista vocal. Con el pase completo desbloqueas Lead 2, Dobles, Armonías y Adlibs.'
                : 'Graba sin límites sobre cualquier beat del catálogo o sube tus propios archivos desde tu teléfono o computadora.'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors shrink-0 ml-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        {/* Modal Body: Login Account Access + The 2 Official Options */}
        <div className="p-5 sm:p-6 space-y-4 relative z-10">
          {/* Quick Account Login Bar */}
          {!userEmail ? (
            <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-zinc-900 to-zinc-900/90 border border-amber-500/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <LogIn className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
                    ¿Ya tienes cuenta o te regalaron un Pase?
                  </h3>
                  <p className="text-[11px] sm:text-xs text-zinc-400">
                    Inicia sesión para sincronizar tus pases y activar el Studio de inmediato.
                  </p>
                </div>
              </div>
              <a
                href="/login?redirect=/studio"
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all text-center shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>Iniciar Sesión</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <div className="p-3 sm:p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase">Conectado con cuenta</p>
                  <p className="text-xs font-mono text-zinc-200 truncate font-semibold">{userEmail}</p>
                </div>
              </div>
              <a
                href="/login?redirect=/studio"
                className="text-[11px] font-mono text-amber-400 hover:text-amber-300 underline shrink-0 transition-colors"
              >
                Cambiar cuenta
              </a>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* OPTION 1: PASE 30 DÍAS x $10 USD */}
            <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-b from-amber-500/10 to-zinc-900/60 border border-amber-500/40 flex flex-col justify-between space-y-4 relative overflow-hidden group hover:border-amber-400 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded">
                    PASE INDIVIDUAL
                  </span>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-white font-mono">
                    $10 <span className="text-xs text-zinc-400 font-normal">USD / 30 Días</span>
                  </div>
                  <div className="text-xs text-amber-200/90 font-medium mt-1">
                    Acceso Total por 1 Mes
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-zinc-300 font-mono">
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>4 pistas vocales multipista</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Sube beats desde tu celular/PC</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Exportación WAV 24-bit ilimitada</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>Descarga de stems acapella RAW</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={handleBuyPass}
                disabled={isLoadingCheckout}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isLoadingCheckout ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <span>Activar por $10</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

            {/* OPTION 2: COMPRAR CUALQUIER BEAT (30 DÍAS GRATIS) */}
            <div className="p-4 sm:p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between space-y-4 hover:border-purple-500/50 transition-all">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-purple-300 font-bold bg-purple-500/20 px-2 py-0.5 rounded">
                    RECOMENDADO
                  </span>
                  <Flame className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-white font-mono">
                    Desde $29 <span className="text-xs text-zinc-400 font-normal">USD</span>
                  </div>
                  <div className="text-xs text-purple-200/90 font-medium mt-1">
                    Beat Comercial + 30 Días GRATIS
                  </div>
                </div>

                <ul className="space-y-2 text-xs text-zinc-300 font-mono">
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span>Licencia comercial MP3 / WAV</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span>Contrato legal con firma digital</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span className="text-purple-300 font-bold">1 Mes de Studio incluido GRATIS</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span>Descarga directa de archivos de máster</span>
                  </li>
                </ul>
              </div>

              <a
                href="/beats"
                className="w-full py-2.5 px-4 rounded-xl bg-white/[0.08] hover:bg-purple-600 hover:text-white border border-white/10 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-center active:scale-95"
              >
                <span>Ver Catálogo de Beats</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="pt-2 text-center">
            <p className="text-[11px] text-zinc-500 font-mono">
              Pagos procesados de forma segura con tarjeta de crédito/débito vía Stripe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
