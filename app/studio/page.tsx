import React from "react";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { AtmosphericBackground } from "@/components/atmosphere";

export const metadata = {
  title: "Studio Specs & Gear | RGODBEAT Production House",
  description: "Especificaciones de estudio, cadena de audio analógico y salas acústicas de RGODBEAT en Austin, TX.",
};

export default function StudioPage() {
  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      <AtmosphericBackground theme="studio" intensity="high" enableStars={true} starDensity="high" animate={true} />
      <Navbar />

      <main className="relative z-10 flex-1 pt-28 sm:pt-36 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="max-w-3xl mb-14 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-amber-400 uppercase">
              STUDIO ENVIRONMENT // AUSTIN HQ
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white uppercase">
            THE STUDIO
          </h1>
          <p className="text-base sm:text-lg text-zinc-400 leading-relaxed">
            Diseñado desde cero con tratamiento acústico de difusión paramétrica, monitoreo de campo cercano y cadena de mezcla analógica híbrida.
          </p>
        </div>

        {/* Gear Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="p-8 rounded-2xl bg-[#0c0b10]/70 border border-white/[0.08] backdrop-blur-xl space-y-4">
            <div className="text-xs font-mono text-amber-400 tracking-wider">01 // MONITORING</div>
            <h3 className="text-xl font-bold text-white">Precision Acoustic Response</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Monitores coaxiales calibrados con subwoofer sellado para una respuesta en graves lineal hasta 28 Hz en sala desacoplada.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-[#0c0b10]/70 border border-white/[0.08] backdrop-blur-xl space-y-4">
            <div className="text-xs font-mono text-purple-400 tracking-wider">02 // SIGNAL CHAIN</div>
            <h3 className="text-xl font-bold text-white">Analog Hybrid Warmth</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Preamplificadores a válvulas clase A, compresores de bus ópticos y conversión AD/DA de 32 bits punto flotante a 192 kHz.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-[#0c0b10]/70 border border-white/[0.08] backdrop-blur-xl space-y-4">
            <div className="text-xs font-mono text-cyan-400 tracking-wider">03 // SYNTH MATRIX</div>
            <h3 className="text-xl font-bold text-white">Boutique Hardware & Digital</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sintetizadores analógicos polifónicos, workstation de producción con latencia de 1.2ms y librerías de sonido propietarias.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-purple-950/30 via-black to-blue-950/30 border border-white/10 text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-white uppercase">¿Quieres agendar una sesión o encargar una producción?</h2>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/beats"
              className="px-8 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-widest uppercase transition-all shadow-[0_0_24px_rgba(168,85,247,0.4)]"
            >
              EXPLORAR CATÁLOGO
            </Link>
            <Link
              href="/the-park"
              className="px-8 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white font-semibold text-xs tracking-widest uppercase transition-all"
            >
              CONOCER THE PARK
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
