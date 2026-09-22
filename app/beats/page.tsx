import React from "react";
import { Navbar, Footer } from "@/components/layout";
import { BeatsShopClient } from "@/components/beats";
import { AtmosphericBackground } from "@/components/atmosphere";
import { getPublishedBeats } from "@/lib/data/beats";
import { getCategories } from "@/lib/data/categories";
import { Beat } from "@/types";

export const dynamic = "force-dynamic";

export default async function BeatsPage() {
  let beats: Beat[] = [];
  let categoryFilters: { id: string; label: string }[] = [{ id: "all", label: "ALL" }];
  let fetchError: string | null = null;

  try {
    const [fetchedBeats, fetchedCategories] = await Promise.all([
      getPublishedBeats(),
      getCategories(),
    ]);

    beats = fetchedBeats;
    categoryFilters = [
      { id: "all", label: "ALL" },
      ...fetchedCategories.map((c) => ({
        id: c.slug,
        label: c.name.toUpperCase(),
      })),
    ];
  } catch (err: any) {
    console.error("[BeatsPage] Error loading marketplace data from Supabase:", err.message);
    fetchError = "Unable to connect to the audio discography database. Please verify your connection or try again shortly.";
  }

  return (
    <div className="relative min-h-screen bg-[#08080a] text-white flex flex-col selection:bg-purple-500/30 selection:text-white">
      {/* Decoupled Atmospheric Background System */}
      <AtmosphericBackground theme="beats" intensity="medium" animate={true} />

      <Navbar />

      <main className="relative z-10 flex-1 pt-28 sm:pt-36 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Editorial Beat Shop Header */}
        <div className="max-w-3xl mb-12 sm:mb-14 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              STUDIO ARCHIVE // DISCOGRAPHY
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white uppercase">
            BEATS
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 font-normal leading-relaxed">
            Production-ready sounds for artists who want to create something that lasts.
            All instrumentals are mixed, mastered, and delivered with uncompressed stems.
          </p>
        </div>

        {fetchError ? (
          /* Clean Editorial User-Facing Error State (Zero Silent Mock Fallback) */
          <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-8 sm:p-12 text-center max-w-2xl mx-auto my-12 space-y-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                Database Temporarily Unavailable
              </h3>
              <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                {fetchError}
              </p>
            </div>

            <div className="pt-2">
              <a
                href="/beats"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-mono tracking-wider uppercase text-white transition-all cursor-pointer"
              >
                <span>↻ RETRY CONNECTION</span>
              </a>
            </div>
          </div>
        ) : (
          <BeatsShopClient
            initialBeats={beats}
            categories={categoryFilters}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
