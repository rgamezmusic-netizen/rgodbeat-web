import React from "react";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { AtmosphericBackground } from "@/components/atmosphere";
import { ServicesSection } from "@/components/home/ServicesSection";

export const metadata = {
  title: "Services | RGODBEAT Audio Engineering & Custom Production",
  description: "Producción musical a medida, mezcla, mastering y licencias exclusivas en Austin, TX.",
};

export default function ServicesPage() {
  return (
    <div className="relative min-h-screen bg-transparent text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      <AtmosphericBackground theme="services" intensity="high" enableStars={true} starDensity="high" animate={true} />
      <Navbar />

      <main className="relative z-10 flex-1 pt-32 sm:pt-36 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-blue-400 uppercase">
              STUDIO SERVICES // PRODUCTION & ENGINEERING
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight uppercase">
            SERVICES <span className="text-zinc-500 font-light text-2xl sm:text-4xl">/ RGODBEAT</span>
          </h1>
        </div>

        <ServicesSection />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 text-center space-y-6">
          <h3 className="text-2xl font-bold uppercase tracking-wide">¿Buscas instrumentales listos para grabar?</h3>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/beats"
              className="px-8 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs tracking-widest uppercase transition-all shadow-[0_0_24px_rgba(168,85,247,0.4)]"
            >
              IR AL CATÁLOGO DE BEATS
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
