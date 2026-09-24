"use client";

import dynamic from "next/dynamic";
import React from "react";

const StudioApp = dynamic(
  () => import("@/components/studio/StudioApp").then((mod) => mod.StudioApp),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center text-white space-y-4 font-mono p-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-sm tracking-[0.2em] uppercase text-amber-400 font-bold">
            RGODBEAT STUDIO // INICIALIZANDO DSP
          </h2>
          <p className="text-xs text-zinc-500 font-mono">
            Calibrando motor de audio de baja latencia a 48.0 kHz 24-bit...
          </p>
        </div>
      </div>
    ),
  }
);

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <StudioApp />
    </div>
  );
}
