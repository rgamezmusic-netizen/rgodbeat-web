import React from "react";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { AtmosphericBackground } from "@/components/atmosphere";

export default function NotFound() {
  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      {/* Procedural Starfield & Atmospheric Background */}
      <AtmosphericBackground theme="beats" intensity="high" enableStars={true} starDensity="high" animate={true} />

      <Navbar />

      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 pt-32 pb-20">
        <div className="max-w-xl w-full text-center space-y-8 rounded-3xl border border-white/[0.08] bg-[#0c0c12]/70 backdrop-blur-2xl p-8 sm:p-12 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[11px] font-mono tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
            ERROR 404 // FRECUENCIA PERDIDA
          </div>

          <div className="space-y-3">
            <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tighter text-white">
              404
            </h1>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase">
              Página o Beat no encontrado
            </h2>
            <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-md mx-auto">
              El beat, archivo o sección que intentas escuchar no existe o ha sido reubicado en el catálogo oficial de RGODBEAT.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/beats"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-widest uppercase transition-all duration-200 shadow-[0_0_24px_rgba(168,85,247,0.4)] hover:shadow-[0_0_32px_rgba(168,85,247,0.6)]"
            >
              EXPLORAR BEATS
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white font-semibold text-xs tracking-widest uppercase transition-all duration-200"
            >
              VOLVER AL INICIO
            </Link>
          </div>

          <div className="pt-4 border-t border-white/[0.06] text-[11px] font-mono text-zinc-500">
            RGODBEAT 2.0 • AUSTIN, TX • ESTUDIO OFICIAL
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
