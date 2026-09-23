import React from "react";
import { Button } from "@/components/ui/Button";

export function TheParkSection() {
  return (
    <section id="the-park" className="relative py-24 sm:py-32 px-4 sm:px-6 lg:px-8 bg-[#0b0b0f]/60 backdrop-blur-md border-y border-white/[0.06] overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 right-0 w-96 h-96 bg-purple-900/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Editorial Presentation */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="text-[11px] font-mono tracking-[0.2em] text-purple-400 uppercase">
                STUDIO CIRCLE // THE PARK
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              MORE THAN A STUDIO.
              <br />
              <span className="text-zinc-400 font-light">AN ARTISTIC ECOSYSTEM.</span>
            </h2>

            <p className="text-base sm:text-lg text-zinc-300 font-normal leading-relaxed">
              <strong>The Park</strong> is RGODBEAT&apos;s private production residency and mentorship collective. 
              Designed for recording artists and producers dedicated to mastering their craft, unlocking their sonic signature, 
              and accessing direct studio-level feedback.
            </p>

            {/* Benefit Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-purple-300 flex items-center gap-1.5">
                  <span>01</span>
                  <span>/ PRIVATE CATALOG</span>
                </div>
                <div className="text-sm font-semibold text-white">Unreleased Sound Banks</div>
                <p className="text-xs text-zinc-400">Direct access to custom sample libraries, drum kits & project stems.</p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-blue-300 flex items-center gap-1.5">
                  <span>02</span>
                  <span>/ STUDIO ACCESS</span>
                </div>
                <div className="text-sm font-semibold text-white">In-Studio Residencies</div>
                <p className="text-xs text-zinc-400">Monthly scheduled recording, mixing, and arrangement sessions.</p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-purple-300 flex items-center gap-1.5">
                  <span>03</span>
                  <span>/ FEEDBACK</span>
                </div>
                <div className="text-sm font-semibold text-white">Direct Production Critique</div>
                <p className="text-xs text-zinc-400">Unfiltered sonic guidance on vocal delivery, pocket, and arrangement.</p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="text-xs font-mono text-blue-300 flex items-center gap-1.5">
                  <span>04</span>
                  <span>/ COMMUNITY</span>
                </div>
                <div className="text-sm font-semibold text-white">Curated Artist Network</div>
                <p className="text-xs text-zinc-400">Private Discord cohort for collaborations, placements, and releases.</p>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Button href="#contact" variant="primary" size="md">
                APPLY FOR RESIDENCY
              </Button>
              <span className="text-xs text-zinc-500 font-mono">
                * Limited cohort to ensure intimate mentorship quality
              </span>
            </div>
          </div>

          {/* Right Column: Visual Brand Card */}
          <div className="lg:col-span-5">
            <div className="relative rounded-2xl bg-[#14141a] border border-white/[0.08] p-8 sm:p-10 overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/10 blur-3xl rounded-full pointer-events-none" />

              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
                  <span className="text-xs font-mono text-zinc-400">MEMBERSHIP PASS</span>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    ADMISSIONS OPEN
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="text-2xl font-bold text-white tracking-tight">The Park Residency</div>
                  <div className="text-xs text-zinc-400 font-normal">Austin, TX • Hybrid In-Person & Remote</div>
                </div>

                <div className="space-y-3 pt-2 text-xs text-zinc-300">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>4 Monthly in-studio private production sessions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>Full royalty release on collaborative cohort tracks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span>Private sound bank & preset vault updates</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/[0.08] flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">Residency Inquiries</div>
                    <div className="text-sm font-semibold text-white">Rgamezmusic@gmail.com</div>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300">
                    ↗
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
