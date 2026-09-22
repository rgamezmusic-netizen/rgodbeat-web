import React from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/server";
import { getAllBeats } from "@/lib/data/beats";
import { getCategories } from "@/lib/data/categories";
import { getLicenseTypes } from "@/lib/data/licenses";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();

  let allBeats: any[] = [];
  let categoryCount = 0;
  let licenseCount = 0;

  try {
    const [beats, categories, licenses] = await Promise.all([
      getAllBeats(),
      getCategories(),
      getLicenseTypes(),
    ]);
    allBeats = beats;
    categoryCount = categories.length;
    licenseCount = licenses.length;
  } catch (err) {
    console.error("[AdminDashboard] Error loading overview metrics:", err);
  }

  const publishedBeats = allBeats.filter((b) => b.published !== false);
  const draftBeats = allBeats.filter((b) => b.published === false);
  const recentBeats = allBeats.slice(0, 5);

  return (
    <div className="space-y-10">
      {/* Editorial Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              STUDIO ARCHIVE // CMS OVERVIEW
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white uppercase">
            Dashboard
          </h1>

          <p className="text-sm text-zinc-400 font-normal">
            Welcome back, <span className="text-zinc-200 font-mono">{user?.email}</span>. Marketplace infrastructure is operational.
          </p>
        </div>

        <div>
          <Link
            href="/admin/beats/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold uppercase tracking-wider shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
          >
            <span>+ NEW BEAT</span>
          </Link>
        </div>
      </div>

      {/* Live Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Published Beats */}
        <Link
          href="/admin/beats?status=published"
          className="p-5 rounded-2xl bg-[#0e0e14] border border-white/[0.08] hover:border-purple-500/40 transition-all group cursor-pointer space-y-2"
        >
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block group-hover:text-purple-400 transition-colors">
            PUBLISHED BEATS
          </span>
          <div className="text-3xl sm:text-4xl font-mono font-extrabold text-white">
            {publishedBeats.length}
          </div>
          <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
            ● Live in store
          </span>
        </Link>

        {/* Draft Beats */}
        <Link
          href="/admin/beats?status=draft"
          className="p-5 rounded-2xl bg-[#0e0e14] border border-white/[0.08] hover:border-amber-500/40 transition-all group cursor-pointer space-y-2"
        >
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block group-hover:text-amber-400 transition-colors">
            DRAFT BEATS
          </span>
          <div className="text-3xl sm:text-4xl font-mono font-extrabold text-white">
            {draftBeats.length}
          </div>
          <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
            ● In development
          </span>
        </Link>

        {/* Categories */}
        <Link
          href="/admin/categories"
          className="p-5 rounded-2xl bg-[#0e0e14] border border-white/[0.08] hover:border-blue-500/40 transition-all group cursor-pointer space-y-2"
        >
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block group-hover:text-blue-400 transition-colors">
            GENRE CATEGORIES
          </span>
          <div className="text-3xl sm:text-4xl font-mono font-extrabold text-white">
            {categoryCount}
          </div>
          <span className="text-[11px] font-mono text-blue-400 flex items-center gap-1">
            ● Trap, R&B, House...
          </span>
        </Link>

        {/* License Types */}
        <Link
          href="/admin/licenses"
          className="p-5 rounded-2xl bg-[#0e0e14] border border-white/[0.08] hover:border-emerald-500/40 transition-all group cursor-pointer space-y-2"
        >
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block group-hover:text-emerald-400 transition-colors">
            ACTIVE LICENSES
          </span>
          <div className="text-3xl sm:text-4xl font-mono font-extrabold text-white">
            {licenseCount}
          </div>
          <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
            ● MP3, WAV, Stems, Unlimited, Exclusive
          </span>
        </Link>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/admin/beats"
          className="p-6 rounded-2xl bg-[#0e0e14] border border-white/[0.06] hover:border-white/20 transition-all space-y-2 group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white uppercase tracking-tight group-hover:text-purple-400 transition-colors">
              Manage Beats
            </h3>
            <span className="text-xs font-mono text-zinc-500 group-hover:translate-x-1 transition-transform">
              →
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Search, filter, update metadata, and review all published and draft catalog assets.
          </p>
        </Link>

        <Link
          href="/admin/categories"
          className="p-6 rounded-2xl bg-[#0e0e14] border border-white/[0.06] hover:border-white/20 transition-all space-y-2 group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white uppercase tracking-tight group-hover:text-purple-400 transition-colors">
              Categories
            </h3>
            <span className="text-xs font-mono text-zinc-500 group-hover:translate-x-1 transition-transform">
              →
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Review active genres, tempos, descriptions, and catalog distribution.
          </p>
        </Link>

        <Link
          href="/admin/licenses"
          className="p-6 rounded-2xl bg-[#0e0e14] border border-white/[0.06] hover:border-white/20 transition-all space-y-2 group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white uppercase tracking-tight group-hover:text-purple-400 transition-colors">
              License Types
            </h3>
            <span className="text-xs font-mono text-zinc-500 group-hover:translate-x-1 transition-transform">
              →
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Inspect commercial pricing tiers, sort order, and included audio rights.
          </p>
        </Link>
      </div>

      {/* Recent Releases Table Overview */}
      <div className="rounded-2xl bg-[#0e0e14] border border-white/[0.08] p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-tight">
              Recent Catalog Releases
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Latest instrumentals recorded in database
            </p>
          </div>

          <Link
            href="/admin/beats"
            className="text-xs font-mono text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider"
          >
            VIEW ALL BEATS →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.06] text-zinc-500 uppercase tracking-wider">
                <th className="pb-3 font-semibold">Title</th>
                <th className="pb-3 font-semibold">Genre</th>
                <th className="pb-3 font-semibold">BPM / Key</th>
                <th className="pb-3 font-semibold">Status</th>
                <th className="pb-3 font-semibold">Price (MP3)</th>
                <th className="pb-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {recentBeats.map((beat) => (
                <tr key={beat.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 font-bold text-white">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-md bg-gradient-to-br ${beat.cover} shrink-0 border border-white/[0.08]`}
                      />
                      <span>{beat.title}</span>
                      {beat.featured && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          FEATURED
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-zinc-400 uppercase">{beat.genre}</td>
                  <td className="py-3 text-zinc-400">
                    {beat.bpm} BPM • {beat.key}
                  </td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                        beat.published !== false
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      {beat.published !== false ? "PUBLISHED" : "DRAFT"}
                    </span>
                  </td>
                  <td className="py-3 text-zinc-200 font-bold">
                    {formatCurrency(beat.price)}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/beats/${beat.slug}`}
                      target="_blank"
                      className="text-zinc-400 hover:text-white transition-colors uppercase mr-3"
                    >
                      View ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
