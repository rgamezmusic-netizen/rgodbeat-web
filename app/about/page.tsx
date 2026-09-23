import React from "react";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { AtmosphericBackground } from "@/components/atmosphere";

export const metadata = {
  title: "About | Rafael Gámez & RGODBEAT",
  description: "Biografía, trayectoria y filosofía de producción de Rafael Gámez (RGODBEAT).",
};

export default function AboutPage() {
  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      <AtmosphericBackground theme="about" intensity="high" enableStars={true} starDensity="high" animate={true} />
      <Navbar />

      <main className="relative z-10 flex-1 pt-28 sm:pt-36 pb-24 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto w-full">
        <div className="space-y-6 mb-12">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              BIOGRAPHY // RAFAEL GÁMEZ
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white uppercase">
            ABOUT RGODBEAT
          </h1>

          <p className="text-lg sm:text-xl text-zinc-300 font-light leading-relaxed">
            Fundado por el productor musical Rafael Gámez, <strong>RGODBEAT</strong> es un sello independiente y casa de producción con sede en Austin, Texas.
          </p>
        </div>

        <div className="p-8 sm:p-12 rounded-3xl bg-[#0c0c12]/70 border border-white/[0.08] backdrop-blur-2xl space-y-6 text-zinc-300 leading-relaxed text-sm sm:text-base">
          <p>
            Especializado en la fusión de ritmos urbanos contemporáneos —desde el reggaetón moderno y trap hasta texturas afrobeat y R&amp;B—, el sonido de RGODBEAT se distingue por una percusión contundente, armonías cinemáticas y un pulido minucioso que cumple los estándares de la industria internacional.
          </p>
          <p>
            A través de la iniciativa <em>The Park</em>, el estudio ofrece un espacio seguro de mentoría, desarrollo artístico y producción de alto calibre para vocalistas, compositores e intérpretes que buscan definir su identidad sonora.
          </p>

          <div className="pt-6 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs font-mono text-zinc-400">
              UBICACIÓN: AUSTIN, TEXAS • GLOBAL REACH
            </div>
            <Link
              href="/beats"
              className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-widest uppercase transition-all shadow-[0_0_20px_rgba(168,85,247,0.4)]"
            >
              ESCUCHAR DISCOGRAFÍA
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
