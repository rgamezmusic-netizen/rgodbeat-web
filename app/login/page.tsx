"use client";

import React, { useState, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInWithEmail } from "@/lib/auth/client";
import { Button } from "@/components/ui/Button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    startTransition(async () => {
      const { user, error } = await signInWithEmail(email, password);

      if (error || !user) {
        setErrorMessage(error?.message || "Invalid credentials. Please verify and try again.");
        return;
      }

      // Successful login
      router.push(redirectTarget);
      router.refresh();
    });
  };

  return (
    <div className="w-full max-w-md p-8 sm:p-10 rounded-2xl bg-[#0e0e14] border border-white/[0.08] shadow-2xl relative z-10 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
          <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
            STUDIO ARCHIVE // CMS
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white uppercase">
          Admin Portal
        </h1>

        <p className="text-xs sm:text-sm text-zinc-400 font-normal">
          Sign in with authorized administrator credentials to manage catalog and licenses.
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-950/30 border border-red-500/30 text-xs text-red-300 flex items-start gap-2.5">
          <svg
            className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="leading-relaxed">{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
            Email Address
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@rgodbeat.com"
            className="w-full px-4 py-3 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
            Password
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
            {isPending ? "VERIFYING..." : "ENTER ADMIN →"}
          </Button>
        </div>
      </form>

      {/* Footer Note */}
      <div className="pt-4 border-t border-white/[0.06] text-center">
        <span className="text-[11px] font-mono text-zinc-500">
          🔒 Protected Area • Authorized Personnel Only
        </span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#08080a] text-white flex flex-col items-center justify-center px-4 relative overflow-hidden selection:bg-purple-500/30 selection:text-white">
      {/* Background Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-purple-900/10 via-indigo-950/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Top Brand Link */}
      <div className="mb-8 text-center">
        <Link
          href="/"
          className="text-xs font-mono text-zinc-500 hover:text-white transition-colors tracking-widest uppercase flex items-center gap-1.5 justify-center"
        >
          <span>←</span>
          <span>RETURN TO STORE</span>
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-md p-10 rounded-2xl bg-[#0e0e14] border border-white/[0.08] text-center">
            <span className="text-xs font-mono text-zinc-500">Loading portal...</span>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
