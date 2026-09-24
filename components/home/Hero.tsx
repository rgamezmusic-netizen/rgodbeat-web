import React from "react";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="relative min-h-[92vh] flex flex-col justify-between pt-32 sm:pt-36 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* 1. Atmospheric Studio Ambient Lighting (Soft, deep, non-gaming) */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] sm:w-[850px] h-[350px] sm:h-[450px] bg-purple-900/12 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[250px] bg-blue-900/10 blur-[120px] rounded-full pointer-events-none" />

      {/* 2. Waveform & Frequency Line Geometry (Subtle architectural sound grid) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-20">
        <svg
          className="w-full max-w-6xl h-64 sm:h-96"
          viewBox="0 0 1200 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Symmetrical Master Waveform Curves */}
          <path
            d="M0 200 C 150 200, 250 110, 400 110 C 550 110, 650 290, 800 290 C 950 290, 1050 200, 1200 200"
            stroke="url(#purpleGrad)"
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />
          <path
            d="M0 200 C 180 200, 280 280, 450 280 C 620 280, 720 120, 900 120 C 1050 120, 1120 200, 1200 200"
            stroke="url(#blueGrad)"
            strokeWidth="1"
          />
          <path
            d="M200 200 C 350 200, 450 70, 600 70 C 750 70, 850 330, 1000 330"
            stroke="url(#purpleGrad)"
            strokeWidth="0.75"
            opacity="0.6"
          />
          {/* Subtle frequency vertical markers */}
          <line x1="300" y1="170" x2="300" y2="230" stroke="white" strokeWidth="0.5" strokeOpacity="0.4" />
          <line x1="600" y1="140" x2="600" y2="260" stroke="white" strokeWidth="0.5" strokeOpacity="0.5" />
          <line x1="900" y1="170" x2="900" y2="230" stroke="white" strokeWidth="0.5" strokeOpacity="0.4" />

          <defs>
            <linearGradient id="purpleGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
              <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="blueGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* 3. Subtle Technical Studio Metadata Markers (Floating left & right on desktop) */}
      <div className="hidden lg:flex absolute top-40 left-8 xl:left-12 flex-col gap-1.5 text-[10px] font-mono text-zinc-500 tracking-[0.2em] uppercase select-none pointer-events-none">
        <span className="text-purple-400/80 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-purple-400" />
          MASTER STEREO BUS
        </span>
        <span>48kHz / 24-BIT UNCOMPRESSED</span>
        <span>PEAK HEADROOM: -0.1 dBTP</span>
      </div>

      <div className="hidden lg:flex absolute top-40 right-8 xl:right-12 flex-col items-end gap-1.5 text-[10px] font-mono text-zinc-500 tracking-[0.2em] uppercase select-none pointer-events-none">
        <span className="text-zinc-400 flex items-center gap-1.5">
          PROD. BY RGODBEAT
          <span className="w-1 h-1 rounded-full bg-blue-400" />
        </span>
        <span>AUSTIN, TX • WORLDWIDE</span>
        <span>CATALOG ARCHIVE // 2.0</span>
      </div>

      {/* 4. Central Hero Content */}
      <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center my-auto">
        {/* Brand Tag Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-white/10 bg-[#121218]/80 backdrop-blur-md mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          <span className="text-[11px] font-mono tracking-[0.22em] text-zinc-300 uppercase">
            RGODBEAT SOUNDS
          </span>
        </div>

        {/* Campaign Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-extrabold tracking-[-0.035em] leading-[0.94] text-white uppercase max-w-4xl select-none">
          YOUR SOUND.
          <br />
          <span className="bg-gradient-to-b from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            YOUR SIGNATURE.
          </span>
        </h1>

        {/* Refined Concise Supporting Copy */}
        <p className="mt-7 sm:mt-8 text-sm sm:text-base md:text-lg text-zinc-400 max-w-2xl font-normal leading-relaxed">
          Bespoke instrumentals and sonic architecture crafted for recording artists, songwriters, and visionaries. 
          Engineered with harmonic depth, vocal pocket, and permanent cultural weight.
        </p>

        {/* Primary & Secondary Action CTAs */}
        <div className="mt-9 sm:mt-11 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          {/* Primary CTA */}
          <Button
            href="#beats"
            variant="primary"
            size="lg"
            className="w-full sm:w-auto shadow-lg hover:shadow-purple-500/15"
          >
            <span>EXPLORE BEATS</span>
            <span className="ml-1 text-base group-hover:translate-x-1 transition-transform duration-200">
              →
            </span>
          </Button>

          {/* Secondary CTA (Solid, high-readability, never looks empty) */}
          <Button
            href="#services"
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
          >
            <span>WORK WITH RGODBEAT</span>
          </Button>
        </div>
      </div>

      {/* 5. Refined Information Strip (Product attributes, no unsupported claims) */}
      <div className="relative z-10 w-full max-w-4xl mx-auto mt-16 sm:mt-20 pt-8 border-t border-white/[0.08]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
          {/* Attribute 1 */}
          <div className="flex flex-col items-center py-2 px-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold tracking-wider text-zinc-100 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              PRODUCTION READY
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-zinc-500 mt-0.5 tracking-wider">
              Radio & streaming calibrated
            </div>
          </div>

          {/* Attribute 2 */}
          <div className="flex flex-col items-center py-2 px-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold tracking-wider text-zinc-100 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
              24-BIT WAV
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-zinc-500 mt-0.5 tracking-wider">
              Lossless studio master
            </div>
          </div>

          {/* Attribute 3 */}
          <div className="flex flex-col items-center py-2 px-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold tracking-wider text-zinc-100 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              FAST DELIVERY
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-zinc-500 mt-0.5 tracking-wider">
              Immediate digital access
            </div>
          </div>

          {/* Attribute 4 */}
          <div className="flex flex-col items-center py-2 px-3 rounded-lg bg-white/[0.015] border border-white/[0.04]">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold tracking-wider text-zinc-100 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
              STEMS AVAILABLE
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono text-zinc-500 mt-0.5 tracking-wider">
              Individual multitrack files
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
