import React from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Navbar, Footer } from "@/components/layout";
import { BeatCard } from "@/components/beats/BeatCard";
import { BeatDetailClient } from "./BeatDetailClient";
import { getBeatBySlug, getPublishedBeats } from "@/lib/data/beats";
import { Beat } from "@/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BeatDetailPage({ params }: PageProps) {
  const { slug } = await params;
  let beat: Beat | null = null;
  let relatedBeats: Beat[] = [];
  let errorMsg: string | null = null;

  try {
    const [fetchedBeat, allBeats] = await Promise.all([
      getBeatBySlug(slug),
      getPublishedBeats(),
    ]);

    beat = fetchedBeat;
    if (beat) {
      relatedBeats = allBeats
        .filter((b) => b.id !== beat!.id && (b.genre === beat!.genre || b.featured))
        .slice(0, 4);
    }
  } catch (err: any) {
    console.error(`[BeatDetailPage] Error loading beat "${slug}" from Supabase:`, err.message);
    errorMsg = "Unable to retrieve instrumental details from the database at this moment.";
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-[#08080a] text-white flex flex-col">
        <Navbar />
        <main className="flex-1 pt-36 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full flex items-center justify-center">
          <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-8 sm:p-12 text-center max-w-md space-y-5">
            <h3 className="text-lg font-bold text-white uppercase tracking-wider">
              Audio Archive Error
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {errorMsg}
            </p>
            <Link
              href="/beats"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-mono tracking-wider uppercase text-white transition-all"
            >
              ← RETURN TO BEAT SHOP
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!beat) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#08080a] text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      <Navbar />

      <main className="flex-1 pt-32 sm:pt-36 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full space-y-20">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <Link href="/beats" className="hover:text-white transition-colors flex items-center gap-1.5">
            <span>←</span>
            <span>BACK TO BEATS</span>
          </Link>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-200 uppercase">{beat.genre}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-purple-400">{beat.title}</span>
        </div>

        {/* Client Interactive Hero Detail Section */}
        <BeatDetailClient beat={beat} />

        {/* Related Instrumentals Section */}
        {relatedBeats.length > 0 && (
          <div className="pt-12 border-t border-white/[0.08] space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-purple-400 uppercase tracking-widest block">
                  RECOMMENDED DISCOGRAPHY
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-1">
                  Similar Soundscapes
                </h3>
              </div>
              <Link
                href="/beats"
                className="text-xs font-mono text-zinc-400 hover:text-white transition-colors"
              >
                VIEW ALL →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedBeats.map((related) => (
                <BeatCard key={related.id} beat={related} />
              ))}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
