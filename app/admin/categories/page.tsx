import React from "react";
import Link from "next/link";
import { getCategories } from "@/lib/data/categories";
import { getAllBeats } from "@/lib/data/beats";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  const [categories, beats] = await Promise.all([
    getCategories(),
    getAllBeats(),
  ]);

  // Compute beat count per category
  const beatCountBySlug: Record<string, number> = {};
  beats.forEach((b) => {
    const slug = b.genre.toLowerCase();
    beatCountBySlug[slug] = (beatCountBySlug[slug] || 0) + 1;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              GENRES & MOODS
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
            Categories
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            {categories.length} CURATED MUSICAL FLOWS CONFIGURED IN SUPABASE
          </p>
        </div>

        <div>
          <Link
            href="/admin/beats"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-mono text-xs uppercase tracking-wider border border-white/[0.08] transition-all"
          >
            ← BACK TO BEATS
          </Link>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const count = beatCountBySlug[cat.slug] || 0;

          return (
            <div
              key={cat.id}
              className="p-5 rounded-2xl bg-[#0e0e14] border border-white/[0.08] hover:border-purple-500/30 transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  {cat.name}
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-[10px] font-mono text-purple-300">
                  {count} {count === 1 ? "BEAT" : "BEATS"}
                </span>
              </div>

              <div className="text-[11px] font-mono text-zinc-500">
                slug: <span className="text-zinc-300">/{cat.slug}</span>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                {cat.description || "Production-ready soundscape tailored for contemporary recordings."}
              </p>

              <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono">
                <span className="text-emerald-400 flex items-center gap-1">
                  ● ACTIVE
                </span>
                <Link
                  href={`/admin/beats`}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  Filter Beats →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
