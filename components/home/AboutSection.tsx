import React from "react";

export function AboutSection() {
  return (
    <section id="about" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-[#09090d]/60 backdrop-blur-md border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Visual Portrait Card */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl bg-gradient-to-b from-[#14141c] to-[#0d0d12] border border-white/[0.08] p-8 sm:p-10 aspect-[4/5] flex flex-col justify-between overflow-hidden shadow-2xl">
              <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
              
              {/* Abstract Architectural Sculpture */}
              <div className="relative z-10 flex items-center justify-between">
                <span className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                  BIOGRAPHY // ARCHIVE
                </span>
                <span className="w-2 h-2 rounded-full bg-purple-500" />
              </div>

              <div className="relative z-10 my-auto text-center space-y-3">
                <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
                  RAFAEL GÁMEZ
                </div>
                <div className="text-sm font-mono tracking-[0.25em] text-purple-400 uppercase">
                  RGODBEAT
                </div>
                <p className="text-xs text-zinc-500 font-normal max-w-xs mx-auto">
                  Music Producer • Sound Architect • Creative Director
                </p>
              </div>

              <div className="relative z-10 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>EST. 2020</span>
                <span>GLOBAL RELEASES</span>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Bio Copy */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="text-[11px] font-mono tracking-[0.2em] text-purple-400 uppercase">
                THE STORY
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              ROOTS IN SOUL.
              <br />
              <span className="text-zinc-400 font-light">SOUNDS OF THE FUTURE.</span>
            </h2>

            <div className="space-y-5 text-sm sm:text-base text-zinc-300 font-normal leading-relaxed">
              <p>
                Raised in Ciudad Jardín, Venezuela, Rafael Gámez grew up immersed in the visceral melodies 
                of Latin America — classic salsa, ballads, and rhythmic passion. As his sonic palate expanded, 
                he drew inspiration from the raw storytelling of American hip-hop and the timeless atmospheric production of MTV&apos;s golden visual era.
              </p>
              <p>
                Under the moniker <strong className="text-white">RGODBEAT</strong>, he merges rich harmonic heritage 
                with forward-thinking electronic sound design, cinematic atmospheres, and hard-hitting urban cadence.
              </p>
              <p className="text-zinc-400">
                His mission is singular: empower independent artists and visionaries with production that carries emotional permanence, 
                cultural identity, and undisputed sonic precision.
              </p>
            </div>

            {/* Quote Strip */}
            <div className="p-6 rounded-xl bg-white/[0.02] border-l-2 border-purple-500 text-sm text-zinc-300 italic">
              &ldquo;Music isn&apos;t just audio in a timeline — it is the soundtrack to an artist&apos;s life, ambition, and identity. Every beat must leave a permanent imprint.&rdquo;
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
