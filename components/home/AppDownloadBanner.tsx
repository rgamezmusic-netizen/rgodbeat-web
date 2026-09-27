import React from "react";
import Link from "next/link";
import { Download, Smartphone, Zap, Music2, ShieldCheck, ArrowRight } from "lucide-react";

export function AppDownloadBanner() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <div className="relative rounded-3xl bg-gradient-to-r from-[#12121a] via-[#161622] to-[#0e0e16] border border-amber-500/30 p-8 sm:p-12 lg:p-14 overflow-hidden shadow-2xl">
        {/* Glow */}
        <div className="absolute top-0 right-0 w-[450px] h-[300px] bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Info & CTAs */}
          <div className="lg:col-span-8 space-y-5 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-[11px] font-mono tracking-widest text-amber-300 uppercase shadow-sm">
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span>NUEVA APP NATIVA · VERSIÓN 1.0 ANDROID</span>
            </div>

            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight font-display">
              Graba tus voces en cualquier lugar con <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent">
                RGodbeat Studio
              </span>
            </h2>

            <p className="text-sm sm:text-base text-zinc-400 max-w-2xl leading-relaxed">
              Descarga el instalador oficial APK para Android. Disfruta de grabación vocal con Auto-Tune en tiempo real, latencia ultra-baja y sonido limpio sin filtros de llamada telefónica.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="/downloads/RGodbeat-Studio.apk"
                download="RGodbeat-Studio.apk"
                className="py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2.5 shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4 stroke-[2.5]" />
                <span>Descargar APK Oficial (1.5 MB)</span>
              </a>

              <Link
                href="/download"
                className="py-3 px-5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-white font-mono text-xs flex items-center gap-2 transition-all"
              >
                <span>Ver Guía de Instalación</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Firma Segura Oficial
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Cero Latencia
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Music2 className="w-3.5 h-3.5 text-amber-400" />
                Auto-Tune Integrado
              </span>
            </div>
          </div>

          {/* Right Column: Visual App Badge */}
          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <div className="relative group">
              <div className="absolute -inset-2 bg-gradient-to-r from-amber-500/30 to-purple-600/30 rounded-3xl blur-xl group-hover:blur-2xl transition-all" />
              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-3xl bg-[#09090d] border-2 border-amber-400/70 p-4 shadow-2xl flex flex-col items-center justify-center text-center">
                <img
                  src="/icons/icon-512.png"
                  alt="RGodbeat Studio"
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain filter drop-shadow-[0_0_12px_rgba(245,158,11,0.5)] mb-2 group-hover:scale-105 transition-transform"
                />
                <span className="text-xs font-bold font-mono text-amber-300 tracking-tight">
                  APK OFICIAL
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  Android 7.0+
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
