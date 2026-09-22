"use client";

import React, { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Beat } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { deleteBeatAction, toggleBeatPublishAction, syncBeatToDiskAction } from "@/lib/actions/beats";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface AdminBeatsTableProps {
  initialBeats: Beat[];
  categories: CategoryOption[];
}

export function AdminBeatsTable({ initialBeats, categories }: AdminBeatsTableProps) {
  const router = useRouter();
  const [beats, setBeats] = useState<Beat[]>(initialBeats);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [genreFilter, setGenreFilter] = useState<string>("all");

  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Sync to external SSD handler
  const handleSyncToSSD = async (slug?: string) => {
    setIsSyncing(true);
    setActionError(null);
    setActionSuccess(null);

    const res = await syncBeatToDiskAction(slug);
    setIsSyncing(false);

    if (!res.success) {
      setActionError(res.error || "Failed to synchronize to SSD.");
      return;
    }

    setActionSuccess(
      slug
        ? `Beat "${slug}" packaged and synchronized to external SSD (RGODBEAT 23 SALE)!`
        : `Synchronized ${res.count || 0} beat(s) to external SSD (RGODBEAT 23 SALE)!`
    );
    router.refresh();

    setTimeout(() => setActionSuccess(null), 5000);
  };

  // Deletion modal state
  const [beatToDelete, setBeatToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync state if initialBeats change from server refresh
  React.useEffect(() => {
    setBeats(initialBeats);
  }, [initialBeats]);

  const filteredBeats = useMemo(() => {
    return beats.filter((beat) => {
      // 1. Status Filter
      if (statusFilter === "published" && beat.published === false) return false;
      if (statusFilter === "draft" && beat.published !== false) return false;

      // 2. Genre Filter
      if (genreFilter !== "all" && beat.genre.toLowerCase() !== genreFilter.toLowerCase()) {
        return false;
      }

      // 3. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          beat.title.toLowerCase().includes(q) ||
          beat.slug.toLowerCase().includes(q) ||
          beat.genre.toLowerCase().includes(q) ||
          beat.mood.toLowerCase().includes(q) ||
          beat.key.toLowerCase().includes(q) ||
          beat.bpm.toString().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [beats, searchQuery, statusFilter, genreFilter]);

  // Handle Quick Toggle Publish
  const handleTogglePublish = (beatId: string, currentPublished: boolean) => {
    setActionError(null);
    setActionSuccess(null);

    const nextPublished = !currentPublished;

    startTransition(async () => {
      const res = await toggleBeatPublishAction(beatId, nextPublished);

      if (!res.success) {
        setActionError(res.error || "Failed to update publish status.");
        return;
      }

      // Optimistically update local state
      setBeats((prev) =>
        prev.map((b) => (b.id === beatId ? { ...b, published: nextPublished } : b))
      );

      setActionSuccess(`Beat successfully ${nextPublished ? "published" : "set to draft"}.`);
      router.refresh();

      setTimeout(() => setActionSuccess(null), 4000);
    });
  };

  // Handle Delete Beat Confirm
  const handleDeleteConfirm = async () => {
    if (!beatToDelete) return;
    setIsDeleting(true);
    setActionError(null);

    const res = await deleteBeatAction(beatToDelete.id);

    if (!res.success) {
      setActionError(res.error || "Failed to delete beat.");
      setIsDeleting(false);
      setBeatToDelete(null);
      return;
    }

    setBeats((prev) => prev.filter((b) => b.id !== beatToDelete.id));
    setActionSuccess(`Beat "${beatToDelete.title}" and its storage files were permanently removed.`);
    setIsDeleting(false);
    setBeatToDelete(null);
    router.refresh();

    setTimeout(() => setActionSuccess(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & New Beat Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              CATALOG MANAGEMENT
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
            Beats
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            {filteredBeats.length} OF {beats.length} INSTRUMENTALS SHOWN
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => handleSyncToSSD()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.1] font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
            title="Synchronize all catalog packages to external SSD (/Volumes/RGodbeat XXX/RGODBEAT 23 SALE)"
          >
            <span>{isSyncing ? "SYNCING..." : "💾 SYNC TO SSD"}</span>
          </button>
          <Link
            href="/admin/beats/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold uppercase tracking-wider shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
          >
            <span>+ NEW BEAT</span>
          </Link>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {actionError && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-xs text-red-300 flex items-start justify-between gap-3">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-300 flex items-start justify-between gap-3">
          <span>{actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Controls Bar: Search, Status Filter, Genre Filter */}
      <div className="p-4 rounded-xl bg-[#0e0e14] border border-white/[0.08] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, genre, mood, BPM, key..."
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white placeholder:text-zinc-500 font-mono transition-all"
          />
          <svg
            className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center p-1 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs font-mono">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-md uppercase transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-purple-600 text-white font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("published")}
              className={`px-3 py-1.5 rounded-md uppercase transition-all cursor-pointer ${
                statusFilter === "published"
                  ? "bg-purple-600 text-white font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Published
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("draft")}
              className={`px-3 py-1.5 rounded-md uppercase transition-all cursor-pointer ${
                statusFilter === "draft"
                  ? "bg-purple-600 text-white font-bold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Drafts
            </button>
          </div>

          {/* Genre Dropdown */}
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#14141c] border border-white/[0.08] text-xs font-mono text-white focus:border-purple-500 focus:outline-none cursor-pointer uppercase"
          >
            <option value="all">ALL GENRES</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.slug}>
                {cat.name.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Beats Catalog Table */}
      <div className="rounded-2xl bg-[#0e0e14] border border-white/[0.08] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-white/[0.02] border-b border-white/[0.08] text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Rank</th>
                <th className="py-3.5 px-4 font-semibold">Beat</th>
                <th className="py-3.5 px-4 font-semibold">Genre</th>
                <th className="py-3.5 px-4 font-semibold">BPM / Key</th>
                <th className="py-3.5 px-4 font-semibold">Duration</th>
                <th className="py-3.5 px-4 font-semibold">Base Price</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold">Local Sync</th>
                <th className="py-3.5 px-4 font-semibold">Created</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredBeats.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-zinc-500">
                    <p className="text-sm">No instrumentals match your current query.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setStatusFilter("all");
                        setGenreFilter("all");
                      }}
                      className="mt-2 text-xs text-purple-400 hover:text-purple-300 underline"
                    >
                      Clear search and filters
                    </button>
                  </td>
                </tr>
              ) : (
                filteredBeats.map((beat) => (
                  <tr key={beat.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Rank */}
                    <td className="py-3 px-4">
                      {beat.currentRank ? (
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm">
                          #{beat.currentRank}
                        </span>
                      ) : (
                        <span className="text-zinc-600 font-mono text-xs">—</span>
                      )}
                    </td>

                    {/* Cover & Title */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {beat.cover.startsWith("http") || beat.cover.startsWith("/") ? (
                          <img
                            src={beat.cover}
                            alt={beat.title}
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/[0.08] shadow-sm"
                          />
                        ) : (
                          <div
                            className={`w-10 h-10 rounded-lg bg-gradient-to-br ${beat.cover} shrink-0 border border-white/[0.08] shadow-sm flex items-center justify-center text-[10px] text-zinc-500 font-bold`}
                          >
                            {beat.genre.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-white text-sm tracking-tight flex items-center gap-1.5">
                            <span>{beat.title}</span>
                            {beat.featured && (
                              <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                ★ FEATURED
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            /{beat.slug}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Genre */}
                    <td className="py-3 px-4 uppercase text-zinc-300">
                      <span className="px-2 py-0.5 rounded bg-white/[0.04] text-[10px] border border-white/[0.06]">
                        {beat.genre}
                      </span>
                    </td>

                    {/* Tempo / Key */}
                    <td className="py-3 px-4 text-zinc-400">
                      <span>{beat.bpm} BPM</span>
                      <span className="mx-1 text-zinc-600">/</span>
                      <span className="text-zinc-300">{beat.key}</span>
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-4 text-zinc-400">
                      {beat.duration}
                    </td>

                    {/* Price */}
                    <td className="py-3 px-4 text-white font-bold">
                      {formatCurrency(beat.price)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
                            beat.rankingStatus === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : beat.rankingStatus === "new"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                              : beat.rankingStatus === "archived"
                              ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {beat.rankingStatus?.toUpperCase() || (beat.published !== false ? "ACTIVE" : "DRAFT")}
                        </span>
                        {beat.published === false && (
                          <span className="text-[8px] text-zinc-500 font-mono">UNPUBLISHED</span>
                        )}
                      </div>
                    </td>

                    {/* Local Sync */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                            beat.localSyncStatus === "synced"
                              ? "text-emerald-400 bg-emerald-950/20 border border-emerald-500/20"
                              : beat.localSyncStatus === "failed"
                              ? "text-red-400 bg-red-950/20 border border-red-500/20"
                              : "text-amber-400 bg-amber-950/20 border border-amber-500/20"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              beat.localSyncStatus === "synced"
                                ? "bg-emerald-400"
                                : beat.localSyncStatus === "failed"
                                ? "bg-red-400"
                                : "bg-amber-400"
                            }`}
                          />
                          {beat.localSyncStatus || "PENDING"}
                        </span>
                        {beat.localSyncStatus !== "synced" && (
                          <button
                            type="button"
                            disabled={isSyncing}
                            onClick={() => handleSyncToSSD(beat.slug)}
                            title="Synchronize this beat to external SSD"
                            className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                          >
                            SYNC
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 text-zinc-500">
                      {beat.createdAt}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/beats/${beat.slug}`}
                          target="_blank"
                          title="View on storefront"
                          className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white transition-all uppercase text-[10px]"
                        >
                          View ↗
                        </Link>

                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleTogglePublish(beat.id, beat.published !== false)}
                          title={beat.published !== false ? "Move to drafts" : "Publish to store"}
                          className={`px-2 py-1 rounded border uppercase text-[10px] transition-all cursor-pointer ${
                            beat.published !== false
                              ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          {beat.published !== false ? "Unpublish" : "Publish"}
                        </button>

                        <Link
                          href={`/admin/beats/${beat.id}/edit`}
                          className="px-2 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 transition-all uppercase text-[10px]"
                        >
                          Edit
                        </Link>

                        <button
                          type="button"
                          onClick={() => setBeatToDelete({ id: beat.id, title: beat.title })}
                          className="px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 transition-all uppercase text-[10px] cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {beatToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#12121a] border border-red-500/30 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-red-400">
              <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-base font-bold text-white uppercase tracking-tight">
                Delete Beat
              </h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete <strong>{beatToDelete.title}</strong>?
            </p>
            <p className="text-xs text-zinc-500">
              This will remove the beat row from the database and permanently clean up all files from both <code>rgodbeat-public</code> and <code>rgodbeat-private</code>.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setBeatToDelete(null)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-mono text-xs uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs uppercase font-bold tracking-wider cursor-pointer"
              >
                {isDeleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
