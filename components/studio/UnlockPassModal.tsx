import React, { useState } from 'react';
import { X, Sparkles, Check, Flame, ArrowRight, Loader2, LogIn, User, Lock, Mail, UserPlus } from 'lucide-react';
import { signInWithEmail, signUpWithEmail } from '@/lib/auth/client';

interface UnlockPassModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'export' | 'tracks' | 'general';
  userEmail?: string | null;
  onAuthSuccess?: () => void;
}

export const UnlockPassModal: React.FC<UnlockPassModalProps> = ({
  isOpen,
  onClose,
  reason = 'general',
  userEmail,
  onAuthSuccess,
}) => {
  // Modal View: 'login' | 'signup' | 'passes'
  const [activeTab, setActiveTab] = useState<'login' | 'signup' | 'passes'>(
    userEmail ? 'passes' : 'login'
  );

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup form state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // Status & loading
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const cleanEmail = loginEmail.trim();
    if (!cleanEmail || !loginPassword) {
      setAuthError('Por favor ingresa tu correo y contraseña.');
      return;
    }

    try {
      setIsLoadingAuth(true);
      const { user, error } = await signInWithEmail(cleanEmail, loginPassword);

      if (error || !user) {
        setAuthError(
          error?.message === 'Invalid login credentials'
            ? 'Credenciales incorrectas. Verifica tu correo y contraseña.'
            : error?.message || 'Error al iniciar sesión. Inténtalo de nuevo.'
        );
        return;
      }

      setAuthSuccess('¡Sesión iniciada con éxito!');
      if (onAuthSuccess) {
        await onAuthSuccess();
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setAuthError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const cleanEmail = signupEmail.trim();
    if (!cleanEmail || !signupPassword) {
      setAuthError('Por favor completa todos los campos.');
      return;
    }

    if (signupPassword.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      setIsLoadingAuth(true);
      const { user, session, error } = await signUpWithEmail(cleanEmail, signupPassword, signupName);

      if (error) {
        setAuthError(error.message || 'Error al registrar la cuenta.');
        return;
      }

      if (session && user) {
        setAuthSuccess('¡Cuenta creada y conectada con éxito!');
        if (onAuthSuccess) {
          await onAuthSuccess();
        }
        setTimeout(() => {
          onClose();
        }, 700);
      } else {
        setAuthSuccess('¡Cuenta registrada! Ya puedes iniciar sesión con tu contraseña.');
        setActiveTab('login');
        setLoginEmail(cleanEmail);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Error al crear la cuenta.');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleBuyPass = async () => {
    try {
      setIsLoadingCheckout(true);
      setCheckoutError(null);

      const res = await fetch('/api/studio/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail || loginEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setActiveTab('login');
          setAuthError('Debes iniciar sesión con tu cuenta antes de activar tu pase.');
          return;
        }
        throw new Error(data.error || 'Error al iniciar checkout.');
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error(err);
      setCheckoutError(err.message || 'No se pudo conectar a la pasarela de pago.');
    } finally {
      setIsLoadingCheckout(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#0d0c12] border border-amber-500/35 rounded-2xl shadow-[0_0_60px_rgba(245,158,11,0.2)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-start justify-between relative z-10 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] sm:text-[11px] font-mono tracking-[0.2em] text-amber-400 uppercase font-bold">
                ACCESO & CUENTA // RGODBEAT STUDIO
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold font-sans text-white uppercase tracking-tight">
              {activeTab === 'login'
                ? 'INICIA SESIÓN EN TU CUENTA'
                : activeTab === 'signup'
                ? 'CREAR CUENTA EN RGODBEAT'
                : reason === 'export'
                ? 'DESBLOQUEA LA EXPORTACIÓN WAV'
                : reason === 'tracks'
                ? 'DESBLOQUEA LAS 4 PISTAS VOCALES'
                : 'ACTIVA TU ACCESO COMPLETO AL STUDIO'}
            </h2>
            <p className="text-xs text-zinc-400">
              {activeTab === 'login' || activeTab === 'signup'
                ? 'Inicia sesión para sincronizar tus pases de 30 días, pases regalados y guardar tu progreso.'
                : 'Disfruta de multipista vocal, grabación con cualquier beat y exportación sin pérdidas.'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors shrink-0 ml-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-850 bg-zinc-950/60 p-1 gap-1 shrink-0 relative z-10">
          <button
            type="button"
            onClick={() => { setActiveTab('login'); setAuthError(null); }}
            className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'login'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Iniciar Sesión</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('signup'); setAuthError(null); }}
            className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'signup'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Crear Cuenta</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('passes'); setAuthError(null); }}
            className={`flex-1 py-2 text-xs font-mono font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'passes'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pases ($10)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 relative z-10 flex-1">
          {/* Messages */}
          {authError && (
            <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs font-mono">
              {authError}
            </div>
          )}
          {authSuccess && (
            <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs font-mono flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          {/* TAB 1: INICIAR SESIÓN DIRECTO EN PANTALLA */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              {userEmail && (
                <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs font-mono text-zinc-300">
                  <span>Conectado como: <strong>{userEmail}</strong></span>
                  <span className="text-[10px] text-amber-400">(Modo Demo)</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 uppercase font-semibold mb-1">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="tu@email.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/90 border border-zinc-750 focus:border-amber-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 font-mono outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 uppercase font-semibold mb-1">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/90 border border-zinc-750 focus:border-amber-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 font-mono outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-98 disabled:opacity-50 cursor-pointer mt-4"
              >
                {isLoadingAuth ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar y Sincronizar Studio</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setActiveTab('signup'); setAuthError(null); }}
                  className="text-xs text-zinc-400 hover:text-amber-300 font-mono transition-colors underline"
                >
                  ¿No tienes cuenta todavía? Regístrate aquí
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CREAR CUENTA DIRECTO EN PANTALLA */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 uppercase font-semibold mb-1">
                  Nombre Artístico / Nombre
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Tu nombre o alias"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/90 border border-zinc-750 focus:border-amber-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 font-mono outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 uppercase font-semibold mb-1">
                  Correo Electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="tu@email.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/90 border border-zinc-750 focus:border-amber-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 font-mono outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-400 uppercase font-semibold mb-1">
                  Contraseña (mínimo 6 caracteres)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/90 border border-zinc-750 focus:border-amber-500 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 font-mono outline-none transition-all shadow-inner"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoadingAuth}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] active:scale-98 disabled:opacity-50 cursor-pointer mt-4"
              >
                {isLoadingAuth ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creando cuenta...</span>
                  </>
                ) : (
                  <>
                    <span>Crear Cuenta y Entrar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setActiveTab('login'); setAuthError(null); }}
                  className="text-xs text-zinc-400 hover:text-amber-300 font-mono transition-colors underline"
                >
                  ¿Ya tienes cuenta? Inicia sesión aquí
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PASES Y SUSCRIPCIÓN STRIPE */}
          {activeTab === 'passes' && (
            <div className="space-y-4">
              {checkoutError && (
                <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-mono">
                  {checkoutError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* OPTION 1: PASE 30 DÍAS x $10 USD */}
                <div className="p-4 rounded-xl bg-gradient-to-b from-amber-500/10 to-zinc-900/60 border border-amber-500/40 flex flex-col justify-between space-y-3 relative overflow-hidden group hover:border-amber-400 transition-all">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded">
                        PASE 30 DÍAS
                      </span>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-extrabold text-white font-mono">
                        $10 <span className="text-xs text-zinc-400 font-normal">USD</span>
                      </div>
                      <div className="text-[11px] text-amber-200/90 font-medium">
                        Acceso Total por 1 Mes
                      </div>
                    </div>

                    <ul className="space-y-1.5 text-[11px] text-zinc-300 font-mono">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>4 pistas vocales multipista</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Sube beats desde tu celular/PC</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Exportación WAV 24-bit ilimitada</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleBuyPass}
                    disabled={isLoadingCheckout}
                    className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.25)] active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingCheckout ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Conectando...</span>
                      </>
                    ) : (
                      <>
                        <span>Activar Pase $10</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>

                {/* OPTION 2: COMPRAR BEAT (30 DÍAS GRATIS) */}
                <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex flex-col justify-between space-y-3 hover:border-purple-500/50 transition-all">
                  <div className="space-y-2.5">
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
                      <div className="text-[11px] text-purple-200/90 font-medium">
                        Beat + 30 Días Studio GRATIS
                      </div>
                    </div>

                    <ul className="space-y-1.5 text-[11px] text-zinc-300 font-mono">
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>Licencia comercial MP3 / WAV</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span className="text-purple-300 font-bold">1 Mes de Studio incluido GRATIS</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>Contrato legal con firma digital</span>
                      </li>
                    </ul>
                  </div>

                  <a
                    href="/beats"
                    className="w-full py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-purple-600 hover:text-white border border-white/10 text-white font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-center active:scale-95"
                  >
                    <span>Ver Beats</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
