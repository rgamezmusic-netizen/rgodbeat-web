"use client";

import React, { useState, useTransition, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInWithEmail, signUpWithEmail } from "@/lib/auth/client";
import { Button } from "@/components/ui/Button";

const ADMIN_EMAILS = [
  "admin@rgodbeat.com",
  "rgamezmusic@gmail.com",
  "rgodbeat@gmail.com",
];

function AuthForm() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage("Por favor ingresa tu correo y contraseña.");
      return;
    }

    startTransition(async () => {
      const { user, error } = await signInWithEmail(cleanEmail, password);

      if (error || !user) {
        setErrorMessage(error?.message || "Credenciales incorrectas. Verifica tu correo y contraseña.");
        return;
      }

      // Check if user is admin
      const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
      const destination = redirectParam || (isAdmin ? "/admin" : "/account");

      // Full window redirect guarantees cookies sync with Supabase SSR middleware
      window.location.href = destination;
    });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage("Por favor completa todos los campos requeridos.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    startTransition(async () => {
      const { user, session, error } = await signUpWithEmail(cleanEmail, password, fullName);

      if (error) {
        setErrorMessage(error.message || "Error al crear la cuenta. Inténtalo de nuevo.");
        return;
      }

      if (session && user) {
        // Automatically signed in
        const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
        const destination = redirectParam || (isAdmin ? "/admin" : "/account");
        window.location.href = destination;
      } else {
        // Fallback if session creation required manual sign in
        setSuccessMessage("¡Cuenta creada exitosamente! Por favor ingresa con tu contraseña.");
        setEmail(cleanEmail);
        setMode("signin");
      }
    });
  };

  return (
    <div className="w-full max-w-md p-8 sm:p-10 rounded-2xl bg-[#0e0e14] border border-white/[0.08] shadow-2xl relative z-10 space-y-7">
      {/* Header */}
      <div className="space-y-2 text-center sm:text-left">
        <div className="flex items-center justify-center sm:justify-start gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
          <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
            RGODBEAT SECURE ACCESS
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase font-sans">
          {mode === "signin" ? "Iniciar Sesión" : "Crear Cuenta"}
        </h1>

        <p className="text-xs sm:text-sm text-zinc-400 font-normal">
          {mode === "signin"
            ? "Accede a tus licencias, historial de descargas y panel de control."
            : "Regístrate para descargar tus beats, guardar favoritos y recibir licencias oficiales."}
        </p>
      </div>

      {/* Tabs Switcher */}
      <div className="flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs font-mono">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 py-2 rounded-lg font-bold transition-all cursor-pointer ${
            mode === "signin"
              ? "bg-purple-600 text-white shadow-md"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          INICIAR SESIÓN
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 py-2 rounded-lg font-bold transition-all cursor-pointer ${
            mode === "signup"
              ? "bg-purple-600 text-white shadow-md"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          CREAR CUENTA
        </button>
      </div>

      {/* Success Alert */}
      {successMessage && (
        <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 flex items-start gap-2.5">
          <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="leading-relaxed">{successMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-950/30 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5">
          <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* Sign In Form */}
      {mode === "signin" ? (
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Contraseña
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isPending}
              className="w-full justify-center text-xs font-mono tracking-widest uppercase font-bold"
            >
              {isPending ? "VERIFICANDO..." : "INGRESAR →"}
            </Button>
          </div>
        </form>
      ) : (
        /* Sign Up Form */
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Nombre o Alias Artístico
            </label>
            <input
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: MC Darian"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="artista@correo.com"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Contraseña (mínimo 6 caracteres)
            </label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Confirmar Contraseña
            </label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={isPending}
              className="w-full justify-center text-xs font-mono tracking-widest uppercase font-bold"
            >
              {isPending ? "CREANDO CUENTA..." : "REGISTRARME GRATIS →"}
            </Button>
          </div>
        </form>
      )}

      {/* Security Guarantee Note */}
      <div className="pt-4 border-t border-white/[0.06] text-center space-y-1">
        <span className="text-[11px] font-mono text-zinc-500 block">
          🔒 Encriptación bcrypt de nivel bancario protegida por Supabase
        </span>
        <span className="text-[10px] font-mono text-zinc-600 block">
          Tus datos personales y contraseñas nunca se guardan en texto plano
        </span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{ paddingTop: "max(2rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))" }}
      className="min-h-screen bg-[#08080a] text-white flex flex-col items-center justify-center px-4 pb-12 relative overflow-hidden selection:bg-purple-500/30 selection:text-white"
    >
      {/* Background Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-purple-900/10 via-indigo-950/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Top Brand Link */}
      <div className="mb-6 text-center">
        <Link
          href="/"
          className="text-xs font-mono text-zinc-400 hover:text-white transition-colors tracking-widest uppercase flex items-center gap-1.5 justify-center py-2 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08]"
        >
          <span>←</span>
          <span>VOLVER A LA TIENDA</span>
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-md p-10 rounded-2xl bg-[#0e0e14] border border-white/[0.08] text-center">
            <span className="text-xs font-mono text-zinc-500">Cargando portal seguro...</span>
          </div>
        }
      >
        <AuthForm />
      </Suspense>
    </div>
  );
}
