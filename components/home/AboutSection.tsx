import Link from "next/link";
import { BIOGRAPHY } from "@/lib/data/biography";

export function AboutSection({ standalone = false }: { standalone?: boolean }) {
  const NameHeading = standalone ? "h1" : "h2";
  const StoryHeading = standalone ? "h2" : "h3";
  const VisionHeading = standalone ? "h3" : "h4";

  return (
    <section id="about" lang="en" aria-label="Biografía de Rafael Gámez" className={standalone
      ? "px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8"
      : "border-t border-white/[0.06] bg-[#09090d]/60 px-4 py-24 sm:px-6 sm:py-32 lg:px-8"}>
      <div className="mx-auto max-w-7xl">
        <div className="grid items-start gap-10 sm:gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:col-span-5">
            <div className="flex min-h-80 flex-col justify-between gap-8 rounded-2xl border border-white/10 bg-gradient-to-b from-[#14141c] to-[#0d0d12] p-6 sm:p-8">
              <p className="text-[10px] font-mono tracking-[0.2em] text-zinc-500">BIOGRAPHY</p>
              <div className="space-y-4">
                <NameHeading className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                  {BIOGRAPHY.name}
                </NameHeading>
                <p className="text-sm leading-relaxed text-zinc-400">
                  <span className="font-semibold text-purple-300">{BIOGRAPHY.brand}</span> — {BIOGRAPHY.roles}
                </p>
              </div>
              <p className="border-t border-white/10 pt-5 text-[11px] font-mono tracking-[0.16em] text-zinc-400">
                {BIOGRAPHY.location}
              </p>
            </div>
          </div>

          <div className="space-y-7 sm:space-y-8 lg:col-span-7">
            <StoryHeading className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl xl:text-5xl">
              {BIOGRAPHY.headline[0]}<br />
              <span className="text-zinc-400">{BIOGRAPHY.headline[1]}</span>
            </StoryHeading>
            <div className="space-y-5 text-sm font-normal leading-relaxed text-zinc-300 sm:text-base">
              {BIOGRAPHY.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            </div>
            <div className="space-y-3 border-t border-white/10 pt-7">
              <VisionHeading className="text-[11px] font-mono font-semibold tracking-[0.2em] text-purple-300">
                {BIOGRAPHY.visionTitle}
              </VisionHeading>
              <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">{BIOGRAPHY.vision}</p>
            </div>
            <blockquote className="border-l-2 border-purple-400 pl-5 text-sm italic leading-relaxed text-zinc-400 sm:text-base">
              {BIOGRAPHY.quote}
            </blockquote>
            {standalone && <Link href="/beats" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-purple-400/30 bg-purple-500/10 px-6 py-3 text-xs font-semibold tracking-widest text-purple-200 transition-colors hover:bg-purple-500/20 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-300">
              EXPLORAR BEATS
            </Link>}
          </div>
        </div>
      </div>
    </section>
  );
}
