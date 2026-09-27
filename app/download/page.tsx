import React from "react";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { AtmosphericBackground } from "@/components/atmosphere";
import { Download, Smartphone, ShieldCheck, Zap, Music2, Sparkles, CheckCircle2, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Descargar RGodbeat Studio App para Android (.APK)",
  description: "Descarga el instalador oficial APK de RGodbeat Studio v1.0. Estudio multipista vocal portátil con Auto-Tune en tiempo real para Android.",
};

export default function DownloadAndroidPage() {
  return (
    <div className="relative min-h-screen bg-[#070709] text-white flex flex-col selection:bg-amber-500/30 selection:text-white">
      <AtmosphericBackground theme="default" intensity="high" enableStars={true} starDensity="high" animate={true} />

      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 w-full">
        {/* Top Tag */}
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-[11px] font-mono tracking-widest text-amber-300 uppercase shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>LANZAMIENTO OFICIAL · VERSIÓN 1.0</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight font-display">
            RGodbeat Studio <br />
            <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent">
              para Android
            </span>
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed font-normal">
            Graba tus tomas vocales sobre cualquier beat con Auto-Tune en tiempo real, latencia ultra-baja y edición multipista profesional en tu dispositivo móvil.
          </p>
        </div>

        {/* Main Download Card */}
        <div className="relative rounded-3xl bg-gradient-to-b from-[#14141e] via-[#0e0e15] to-[#09090d] border border-amber-500/30 p-8 sm:p-12 text-center shadow-2xl overflow-hidden mb-16 backdrop-blur-xl">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[180px] bg-amber-500/15 blur-[90px] rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center">
            {/* App Icon Glow */}
            <div className="relative mb-6">
              <div className="absolute -inset-2 bg-amber-500/30 rounded-3xl blur-xl animate-pulse" />
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-zinc-950 border-2 border-amber-400/80 p-2 shadow-2xl flex items-center justify-center overflow-hidden">
                <img
                  src="/icons/icon-512.png"
                  alt="RGodbeat Studio App"
                  className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white font-mono mb-1">
              RGodbeat Studio v1.0
            </h2>
            <p className="text-xs font-mono text-zinc-400 mb-6">
              Instalador APK firmado · 1.5 MB · Compatible con Android 7.0+
            </p>

            {/* CTA Buttons */}
            <div className="w-full space-y-3">
              <a
                href="/downloads/RGodbeat-Studio.apk"
                download="RGodbeat-Studio.apk"
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-black font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(245,158,11,0.5)] transition-all active:scale-[0.98] cursor-pointer"
              >
                <Download className="w-5 h-5 stroke-[2.5]" />
                <span>DESCARGAR APK DIRECTO (1.5 MB)</span>
              </a>

              <Link
                href="/studio"
                className="w-full py-3 px-4 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white font-mono text-xs flex items-center justify-center gap-2 transition-all"
              >
                <span>O usar versión web en el navegador</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Security Badges */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-8 pt-6 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                Firma Criptográfica Verificada
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
                Sin Anuncios ni Rastreadores
              </span>
            </div>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-white/[0.06] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Music2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white font-mono">Audio Limpio sin Filtro de Llamada</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              El motor nativo de Chromium procesa el micrófono y el beat en calidad de estudio sin activar filtros telefónicos indeseados.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-white/[0.06] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white font-mono">Auto-Tune en Tiempo Real</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Afinación automática que se sincroniza con el tono de tu beat (Mayor o Menor) con control de velocidad y presencia vocal.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-white/[0.06] space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white font-mono">Pantalla Completa Nativa</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Sin barras de dirección ni distracciones del navegador. Tu estación de trabajo DAW siempre a mano en tu pantalla de inicio.
            </p>
          </div>
        </div>

        {/* 3-Step Installation Guide */}
        <div className="rounded-3xl bg-[#0c0c12] border border-zinc-800 p-8 sm:p-10">
          <h3 className="text-lg font-bold text-white font-mono mb-6 text-center">
            ¿Cómo instalarlo en tu teléfono en 3 pasos?
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-black font-black font-mono flex items-center justify-center text-sm shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                1
              </div>
              <h4 className="text-sm font-bold text-zinc-200">Descarga el APK</h4>
              <p className="text-xs text-zinc-400">
                Toca el botón amarillo de arriba. Tu navegador descargará el archivo oficial <span className="text-amber-300 font-mono">RGodbeat-Studio.apk</span>.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-black font-black font-mono flex items-center justify-center text-sm shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                2
              </div>
              <h4 className="text-sm font-bold text-zinc-200">Toca Instalar</h4>
              <p className="text-xs text-zinc-400">
                Abre la notificación de descarga o tu carpeta de Archivos. Si Android te pregunta, permite instalar desde esta fuente.
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-amber-500 text-black font-black font-mono flex items-center justify-center text-sm shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                3
              </div>
              <h4 className="text-sm font-bold text-zinc-200">¡Comienza a Grabar!</h4>
              <p className="text-xs text-zinc-400">
                Inicia sesión con tu cuenta de RGodbeat, carga tu beat favorito y empieza a grabar tus voces como un profesional.
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
