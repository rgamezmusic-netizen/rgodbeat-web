"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { updateBeatDirectAction, deleteBeatAction, getBeatUploadUrlsAction } from "@/lib/actions/beats";
import { uploadFileToSignedUrl } from "@/lib/storage/upload-client";
import { formatCurrency } from "@/lib/utils";
import type { BeatEditData } from "@/types";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface LicenseTypeOption {
  id: string;
  name: string;
  slug?: string;
  price: number;
}

interface EditBeatFormProps {
  beat: BeatEditData;
  categories: CategoryOption[];
  licenseTypes: LicenseTypeOption[];
}

interface FileState {
  file: File | null;
  status: "idle" | "selected" | "error";
  errorMessage?: string;
}

export function EditBeatForm({ beat, categories, licenseTypes }: EditBeatFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Basic Information
  const [title, setTitle] = useState(beat.title);
  const [slug, setSlug] = useState(beat.slug);
  const [description, setDescription] = useState(beat.description || "");
  const [genreId, setGenreId] = useState(beat.genre_id || categories[0]?.id || "");
  const [mood, setMood] = useState(beat.mood || "Dark");
  const [bpm, setBpm] = useState(beat.bpm ? String(beat.bpm) : "140");
  const [key, setKey] = useState(beat.musical_key || "Am");
  const [duration, setDuration] = useState(
    beat.duration_seconds
      ? `${Math.floor(beat.duration_seconds / 60)}:${(beat.duration_seconds % 60).toString().padStart(2, "0")}`
      : "3:00"
  );
  const [featured, setFeatured] = useState(beat.featured);
  const [published, setPublished] = useState(beat.published);

  // Asset Replacement Files
  const [coverState, setCoverState] = useState<FileState>({ file: null, status: "idle" });
  const [previewState, setPreviewState] = useState<FileState>({ file: null, status: "idle" });
  const [wavState, setWavState] = useState<FileState>({ file: null, status: "idle" });

  // Licenses Configuration State
  const initialLicenseState: Record<string, { enabled: boolean; overridePrice: string }> = {};
  licenseTypes.forEach((lt) => {
    const existing = beat.licenses.find((l) => l.license_type_id === lt.id);
    initialLicenseState[lt.id] = {
      enabled: !!existing && existing.active,
      overridePrice: existing && existing.price_override !== null ? String(existing.price_override) : "",
    };
  });
  const [selectedLicenses, setSelectedLicenses] = useState(initialLicenseState);

  // Status & Feedback
  const [formError, setFormError] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // File Handlers
  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCoverState({ file: null, status: "error", errorMessage: "Must be JPEG, PNG, or WebP" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setCoverState({ file: null, status: "error", errorMessage: "File exceeds 15 MB limit" });
      return;
    }
    setCoverState({ file, status: "selected" });
  };

  const handlePreviewChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes("audio") && !file.name.endsWith(".mp3")) {
      setPreviewState({ file: null, status: "error", errorMessage: "Must be an MP3 audio file" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setPreviewState({ file: null, status: "error", errorMessage: "File exceeds 15 MB limit" });
      return;
    }
    setPreviewState({ file, status: "selected" });
  };

  const handleWavChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".wav")) {
      setWavState({ file: null, status: "error", errorMessage: "Must be an uncompressed WAV file (.wav)" });
      return;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setWavState({ file: null, status: "error", errorMessage: "File exceeds 2 GB limit" });
      return;
    }
    setWavState({ file, status: "selected" });
  };

  const handleLicenseToggle = (id: string) => {
    setSelectedLicenses((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id]?.enabled },
    }));
  };

  const handlePriceOverrideChange = (id: string, price: string) => {
    setSelectedLicenses((prev) => ({
      ...prev,
      [id]: { ...prev[id], overridePrice: price },
    }));
  };

  // Submit Handler with Direct-to-Storage Upload
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim() || !slug.trim()) {
      setFormError("Title and slug are required fields.");
      return;
    }

    startTransition(async () => {
      try {
        setProgressStatus("Saving changes & updating assets...");
        setUploadPercent(0);

        let newCoverPath = beat.cover_path;
        let newPreviewPath = beat.preview_path;
        let newWavPath: string | null = null;

        // Check if any new file was selected for replacement
        const hasNewCover = Boolean(coverState.file);
        const hasNewPreview = Boolean(previewState.file);
        const hasNewWav = Boolean(wavState.file);

        if (coverState.file && coverState.file.size > 52428800) {
          throw new Error(`La portada de reemplazo (${(coverState.file.size / 1024 / 1024).toFixed(1)} MB) supera los 50 MB.`);
        }
        if (previewState.file && previewState.file.size > 52428800) {
          throw new Error(`El audio MP3 de reemplazo (${(previewState.file.size / 1024 / 1024).toFixed(1)} MB) supera los 50 MB.`);
        }

        if (hasNewCover || hasNewPreview || hasNewWav) {
          const coverExt = coverState.file
            ? (coverState.file.name.split(".").pop()?.toLowerCase() || "jpg")
            : undefined;

          const uploadUrlsRes = await getBeatUploadUrlsAction({
            beatId: beat.id,
            coverExt,
            hasPreview: hasNewPreview,
            wavFileName: wavState.file ? wavState.file.name : undefined,
          });

          if (!uploadUrlsRes.success) {
            throw new Error(uploadUrlsRes.error || "Failed to generate upload authorizations.");
          }

          if (coverState.file && uploadUrlsRes.cover) {
            setProgressStatus("Uploading replacement cover artwork...");
            await uploadFileToSignedUrl(
              uploadUrlsRes.cover.signedUrl,
              coverState.file,
              coverState.file.type || "image/jpeg",
              (pct) => setUploadPercent(pct)
            );
            newCoverPath = uploadUrlsRes.cover.path;
          }

          if (previewState.file && uploadUrlsRes.preview) {
            setProgressStatus("Uploading replacement preview MP3...");
            await uploadFileToSignedUrl(
              uploadUrlsRes.preview.signedUrl,
              previewState.file,
              previewState.file.type || "audio/mpeg",
              (pct) => setUploadPercent(pct)
            );
            newPreviewPath = uploadUrlsRes.preview.path;
          }

          if (wavState.file && uploadUrlsRes.wav) {
            setProgressStatus("Uploading replacement Master WAV...");
            await uploadFileToSignedUrl(
              uploadUrlsRes.wav.signedUrl,
              wavState.file,
              "audio/wav",
              (pct) => {
                setUploadPercent(pct);
                setProgressStatus(`Uploading Master WAV (${pct}%)...`);
              }
            );
            newWavPath = uploadUrlsRes.wav.path;
          }
        }

        setProgressStatus("Updating database record...");
        setUploadPercent(100);

        const licensesPayload = Object.entries(selectedLicenses)
          .filter(([_, conf]) => conf.enabled)
          .map(([id, conf]) => ({
            licenseTypeId: id,
            priceOverride: conf.overridePrice ? parseFloat(conf.overridePrice) : null,
          }));

        const res = await updateBeatDirectAction({
          beatId: beat.id,
          title,
          slug,
          description,
          genreId,
          mood,
          bpm: bpm ? parseInt(bpm, 10) : null,
          key,
          duration,
          featured,
          published,
          coverPath: newCoverPath,
          previewPath: newPreviewPath,
          previewFileSize: previewState.file?.size || null,
          wavPath: newWavPath,
          wavFileName: wavState.file?.name || null,
          wavFileSize: wavState.file?.size || null,
          licenses: licensesPayload,
        });

        if (!res.success) {
          throw new Error(res.error || "Failed to update beat.");
        }

        setProgressStatus("Saved! Redirecting to catalog...");
        router.push("/admin/beats");
        router.refresh();
      } catch (err: any) {
        console.error("[EditBeatForm] Error:", err);
        setFormError(err.message || "Failed to update beat.");
        setProgressStatus(null);
        setUploadPercent(null);
      }
    });
  };

  // Delete Handler
  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setFormError(null);

    const res = await deleteBeatAction(beat.id);
    if (!res.success) {
      setFormError(res.error || "Failed to delete beat.");
      setIsDeleting(false);
      setShowDeleteModal(false);
      return;
    }

    router.push("/admin/beats");
    router.refresh();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              STUDIO CATALOG // EDIT BEAT
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
            {beat.title}
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            ID: {beat.id} // SLUG: /{beat.slug}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/beats/${beat.slug}`}
            target="_blank"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 font-mono text-xs uppercase tracking-wider border border-white/[0.08] transition-all"
          >
            <span>VIEW IN STORE ↗</span>
          </Link>
          <Link
            href="/admin/beats"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-mono text-xs uppercase tracking-wider border border-white/[0.08] transition-all"
          >
            ← BACK TO BEATS
          </Link>
        </div>
      </div>

      {/* Global Error Banner */}
      {formError && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-xs text-red-300 flex items-start gap-3">
          <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <strong className="block font-bold text-red-200">Unable to save beat changes</strong>
            <span>{formError}</span>
          </div>
        </div>
      )}

      {/* Progress Toast with Visual Bar */}
      {progressStatus && (
        <div className="p-5 rounded-2xl bg-purple-950/40 border border-purple-500/40 text-xs text-purple-200 space-y-3 shadow-xl shadow-purple-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
              <span className="font-mono font-bold uppercase tracking-wider">{progressStatus}</span>
            </div>
            {uploadPercent !== null && (
              <span className="font-mono font-extrabold text-sm text-purple-300">{uploadPercent}%</span>
            )}
          </div>
          {uploadPercent !== null && (
            <div className="w-full bg-white/[0.08] rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-emerald-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* 1. BASIC INFORMATION */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] space-y-6">
          <div className="border-b border-white/[0.06] pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              1. Basic Information
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Core metadata and catalog indexing
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Title */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Title <span className="text-purple-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white font-mono transition-all"
              />
            </div>

            {/* Slug */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                URL Slug <span className="text-purple-400">*</span>
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 rounded-l-lg bg-white/[0.02] border border-r-0 border-white/[0.08] text-xs font-mono text-zinc-500">
                  /beats/
                </span>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  className="w-full px-4 py-2.5 rounded-r-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white font-mono transition-all"
                />
              </div>
            </div>

            {/* Genre */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Genre Category <span className="text-purple-400">*</span>
              </label>
              <select
                value={genreId}
                onChange={(e) => setGenreId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#14141c] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white font-mono"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Mood */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Mood Vibe
              </label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-[#14141c] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white font-mono"
              >
                {["Dark", "Melodic", "Energetic", "Atmospheric", "Aggressive", "Chill", "Romantic", "Epic", "Soulful"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            {/* BPM */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                BPM Tempo <span className="text-purple-400">*</span>
              </label>
              <input
                type="number"
                min="30"
                max="300"
                required
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white font-mono"
              />
            </div>

            {/* Musical Key */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Musical Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white font-mono"
              />
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Duration (mm:ss)
              </label>
              <input
                type="text"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white font-mono"
              />
            </div>

            {/* Featured Toggle */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="text-xs font-mono text-white block uppercase">FEATURED RELEASE</span>
                  <span className="text-[10px] text-zinc-500">Pinned on homepage spotlight banner</span>
                </div>
              </label>
            </div>

            {/* Description */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
                Editorial Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white placeholder:text-zinc-600 font-mono resize-y"
              />
            </div>
          </div>
        </section>

        {/* 2. AUDIO & ARTWORK ASSETS (REPLACEMENT / STATUS) */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] space-y-6">
          <div className="border-b border-white/[0.06] pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              2. Audio & Artwork Assets
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Review current storage files or upload replacement masters
            </p>
          </div>

          <div className="space-y-6">
            {/* Cover Artwork */}
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-white uppercase">Cover Artwork</span>
                  <span className="text-[10px] font-mono text-zinc-500 block">Bucket: rgodbeat-public (Max 50MB, JPG/PNG/WebP)</span>
                </div>
                {beat.cover_path ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    CURRENTLY HOSTED
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    MISSING
                  </span>
                )}
              </div>

              {beat.cover_url && (
                <div className="flex items-center gap-3">
                  <img
                    src={beat.cover_url}
                    alt={beat.title}
                    className="w-12 h-12 rounded-lg object-cover border border-white/[0.08]"
                  />
                  <span className="text-[11px] font-mono text-zinc-400 truncate max-w-md">
                    {beat.cover_path}
                  </span>
                </div>
              )}

              <div className="pt-2">
                <label className="text-[11px] font-mono text-purple-400 block mb-1">
                  Upload replacement cover (optional):
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCoverChange}
                  className="text-xs font-mono text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-mono file:bg-white/[0.06] file:text-white hover:file:bg-white/[0.1] file:cursor-pointer"
                />
                {coverState.file && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-1">
                    ✓ Replacement staged: {coverState.file.name} ({(coverState.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            </div>

            {/* Preview MP3 */}
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-white uppercase">Preview MP3 (Tagged/Watermarked)</span>
                  <span className="text-[10px] font-mono text-zinc-500 block">Bucket: rgodbeat-public (Max 50MB, MP3)</span>
                </div>
                {beat.preview_path ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    CURRENTLY HOSTED
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    MISSING
                  </span>
                )}
              </div>

              {beat.preview_url && (
                <div className="space-y-1">
                  <span className="text-[11px] font-mono text-zinc-400 block truncate">
                    {beat.preview_path}
                  </span>
                  <audio controls src={beat.preview_url} className="h-8 w-full max-w-md" />
                </div>
              )}

              <div className="pt-2">
                <label className="text-[11px] font-mono text-purple-400 block mb-1">
                  Upload replacement preview MP3 (optional):
                </label>
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3"
                  onChange={handlePreviewChange}
                  className="text-xs font-mono text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-mono file:bg-white/[0.06] file:text-white hover:file:bg-white/[0.1] file:cursor-pointer"
                />
                {previewState.file && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-1">
                    ✓ Replacement staged: {previewState.file.name} ({(previewState.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            </div>

            {/* Master WAV Audio */}
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-mono font-bold text-white uppercase">Master WAV Audio</span>
                  <span className="text-[10px] font-mono text-zinc-500 block">Supabase privado · Hasta 50 MB por archivo en Free</span>
                </div>
                {beat.wav_file ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    SECURED IN VAULT
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    MISSING MASTER
                  </span>
                )}
              </div>

              {beat.wav_file && (
                <div className="text-[11px] font-mono text-zinc-300">
                  <span>File: <strong>{beat.wav_file.file_name}</strong></span>
                  {beat.wav_file.file_size && (
                    <span className="text-zinc-500 ml-2">
                      ({(beat.wav_file.file_size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  )}
                  <span className="block text-[10px] text-zinc-600 truncate mt-0.5">
                    Storage: {beat.wav_file.storage_path}
                  </span>
                </div>
              )}

              <div className="pt-2 space-y-2">
                <label className="text-[11px] font-mono text-purple-400 block mb-1">
                  Upload replacement master WAV (optional):
                </label>
                <input
                  type="file"
                  accept=".wav,audio/wav,audio/x-wav"
                  onChange={handleWavChange}
                  className="text-xs font-mono text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-mono file:bg-white/[0.06] file:text-white hover:file:bg-white/[0.1] file:cursor-pointer"
                />
                {wavState.file && (
                  <p className="text-[11px] font-mono text-emerald-400 mt-1">
                    ✓ Replacement staged: {wavState.file.name} ({(wavState.file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                {wavState.file && wavState.file.size > 52428800 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200 space-y-1">
                    <div className="font-bold flex items-center gap-1 text-amber-300">
                      <span>⚠️</span>
                      <span>WAV mayor a 50MB ({(wavState.file.size / 1024 / 1024).toFixed(1)} MB)</span>
                    </div>
                    <p className="text-zinc-300 leading-normal">
                      Si tu plan de Supabase es gratuito, el límite por archivo es 50MB. El tamaño depende de la duración y el formato. Conserva tu original y revisa el límite en <em>Supabase Dashboard &gt; Storage Settings</em>.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 3. COMMERCIAL LICENSES & PRICE OVERRIDES */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] space-y-6">
          <div className="border-b border-white/[0.06] pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              3. Commercial Licenses & Price Overrides
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Select contract tiers active for this beat and set custom prices if desired
            </p>
          </div>

          <div className="space-y-4">
            {licenseTypes.map((lic) => {
              const state = selectedLicenses[lic.id] || { enabled: false, overridePrice: "" };
              return (
                <div
                  key={lic.id}
                  className={`p-4 rounded-xl border transition-all ${
                    state.enabled
                      ? "bg-purple-950/10 border-purple-500/30"
                      : "bg-white/[0.01] border-white/[0.06] opacity-60"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={state.enabled}
                        onChange={() => handleLicenseToggle(lic.id)}
                        className="w-4 h-4 rounded border-white/20 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-mono font-bold text-white uppercase block">
                          {lic.name} ({lic.slug || "standard"})
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          Base store price: {formatCurrency(lic.price)}
                        </span>
                      </div>
                    </label>

                    {state.enabled && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-400">Override: $</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder={String(lic.price)}
                          value={state.overridePrice}
                          onChange={(e) => handlePriceOverrideChange(lic.id, e.target.value)}
                          className="w-24 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 4. PUBLISHING STATUS & SUBMIT */}
        <section className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] space-y-6">
          <div className="border-b border-white/[0.06] pb-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              4. Publication Status
            </h2>
            <p className="text-xs text-zinc-500 font-mono mt-0.5">
              Control availability on the public store
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                !published
                  ? "bg-amber-950/20 border-amber-500/40 text-amber-200"
                  : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="publishStatus"
                checked={!published}
                onChange={() => setPublished(false)}
                className="mt-0.5"
              />
              <div>
                <strong className="block text-xs font-mono uppercase text-white">Draft Mode (Hidden)</strong>
                <span className="text-[11px] block mt-0.5">
                  Visible only inside Admin CMS. Inaccessible to public buyers.
                </span>
              </div>
            </label>

            <label
              className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                published
                  ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-200"
                  : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/20"
              }`}
            >
              <input
                type="radio"
                name="publishStatus"
                checked={published}
                onChange={() => setPublished(true)}
                className="mt-0.5"
              />
              <div>
                <strong className="block text-xs font-mono uppercase text-white">Published (Live in Store)</strong>
                <span className="text-[11px] block mt-0.5">
                  Listed in marketplace catalog and active for licensing.
                </span>
              </div>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="text-xs font-mono text-red-400 hover:text-red-300 hover:underline uppercase tracking-wider cursor-pointer"
            >
              Delete this beat...
            </button>

            <div className="flex items-center gap-3">
              <Link
                href="/admin/beats"
                className="px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-mono text-xs uppercase tracking-wider border border-white/[0.08] transition-all"
              >
                Cancel
              </Link>
              <Button
                type="submit"
                variant="primary"
                disabled={isPending}
                className="px-6 py-2.5 font-mono text-xs uppercase tracking-wider"
              >
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </section>
      </form>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#12121a] border border-red-500/30 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-red-400">
              <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-base font-bold text-white uppercase tracking-tight">
                Confirm Beat Deletion
              </h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete <strong>{beat.title}</strong>?
            </p>
            <p className="text-xs text-zinc-500">
              This action will permanently delete the beat record, remove all associated cover artwork and preview MP3 files from <code>rgodbeat-public</code>, and delete all master WAV files from <code>rgodbeat-private</code>. This cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-mono text-xs uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-mono text-xs uppercase font-bold tracking-wider"
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
