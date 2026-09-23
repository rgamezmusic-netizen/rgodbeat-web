import React from "react";
import { Button } from "@/components/ui/Button";

export function CtaSection() {
  return (
    <section id="contact" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="relative rounded-3xl bg-gradient-to-b from-[#15151e] via-[#0f0f15] to-[#0a0a0e] border border-white/[0.08] p-10 sm:p-16 lg:p-20 text-center overflow-hidden shadow-2xl">
        {/* Ambient Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[220px] bg-purple-600/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-mono tracking-widest text-purple-300 uppercase">
            COMMERCIAL LICENSING & INQUIRIES
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Ready to record your next breakthrough?
          </h2>

          <p className="text-sm sm:text-base text-zinc-400 font-normal leading-relaxed">
            Browse high-definition instrumentals ready for immediate digital delivery, 
            or get in touch for custom production and executive album direction.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button href="#beats" variant="primary" size="lg" className="w-full sm:w-auto">
              EXPLORE BEAT CATALOG
            </Button>
            <Button
              href="mailto:rgodbeat@gmail.com"
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
            >
              DIRECT INQUIRY
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
