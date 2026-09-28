"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getBeatUploadUrlsAction, createBeatDirectAction } from "@/lib/actions/beats";
import { uploadFileToSignedUrl } from "@/lib/storage/upload-client";
import { formatCurrency } from "@/lib/utils";

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

interface NewBeatFormProps {
  categories: CategoryOption[];
  licenseTypes: LicenseTypeOption[];
}

interface FileState {
  file: File | null;
  status: "idle" | "selected" | "error";
  errorMessage?: string;
}

export function NewBeatForm({ categories, licenseTypes }: NewBeatFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Basic Information
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [description, setDescription] = useState("");
  const [genreId, setGenreId] = useState(categories[0]?.id || "");
  const [mood, setMood] = useState("Dark");
  const [bpm, setBpm] = useState("140");
  const [key, setKey] = useState("C");
  const [duration, setDuration] = useState("3:00");
  const [featured, setFeatured] = useState(false);

  // Media Files
  const [coverState, setCoverState] = useState<FileState>({ file: null, status: "idle" });
  const [previewState, setPreviewState] = useState<FileState>({ file: null, status: "idle" });
  const [wavState, setWavState] = useState<FileState>({ file: null, status: "idle" });

  // License Selections
  const [selectedLicenses, setSelectedLicenses] = useState<Record<string, { enabled: boolean; overridePrice: string }>>(
    licenseTypes.reduce((acc, lt) => {
      acc[lt.id] = { enabled: true, overridePrice: "" };
      return acc;
    }, {} as Record<string, { enabled: boolean; overridePrice: string }>)
  );

  // Submission Status
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadProgressStatus, setUploadProgressStatus] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  // Auto detect duration from audio file
  const detectDuration = (file: File) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          const mins = Math.floor(audio.duration / 60);
          const secs = Math.floor(audio.duration % 60);
          setDuration(`${mins}:${String(secs).padStart(2, "0")}`);
        }
      });
    } catch {
      // Audio element fallback
    }
  };

  // Auto-generate slug from title
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (!isSlugCustomized) {
      const generatedSlug = newTitle
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSlug(generatedSlug);
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugCustomized(true);
    setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
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

  // Direct-to-storage Submit Handler (Bypasses Vercel 4.5 MB payload limit)
  const handleSubmit = async (publishImmediate: boolean) => {
    setFormError(null);

    if (!title.trim() || !slug.trim()) {
      setFormError("Title and URL slug are required.");
      return;
    }

    if (publishImmediate) {
      if (!coverState.file) {
        setFormError("Cover artwork file (.jpg, .png, .webp) is required to publish.");
        return;
      }
      if (!previewState.file) {
        setFormError("Preview MP3 audio file is required to publish so customers can listen in the web store.");
        return;
      }
      if (!wavState.file) {
        setFormError("Master WAV audio file is required to publish.");
        return;
      }
    }

    startTransition(async () => {
      try {
        setUploadProgressStatus("Preparing secure storage upload...");
        setUploadPercent(0);

        // 1. Request presigned upload URLs (pure metadata request, 0 audio bytes sent to Vercel)
        const coverExt = coverState.file ? (coverState.file.name.split(".").pop()?.toLowerCase() || "jpg") : undefined;
        const uploadUrlsRes = await getBeatUploadUrlsAction({
          coverExt,
          hasPreview: Boolean(previewState.file),
          wavFileName: wavState.file ? wavState.file.name : undefined,
        });

        if (!uploadUrlsRes.success || !uploadUrlsRes.beatId) {
          throw new Error(uploadUrlsRes.error || "Failed to generate upload authorization.");
        }

        const beatId = uploadUrlsRes.beatId;
        let coverPath: string | null = null;
        let previewPath: string | null = null;
        let wavPath: string | null = null;

        // 2. Upload Cover directly from browser to Supabase Storage (rgodbeat-public)
        if (coverState.file && uploadUrlsRes.cover) {
          setUploadProgressStatus("Step 1/3: Uploading cover artwork...");
          setUploadPercent(10);
          await uploadFileToSignedUrl(
            uploadUrlsRes.cover.signedUrl,
            coverState.file,
            coverState.file.type || "image/jpeg",
            (pct) => setUploadPercent(Math.round(pct * 0.2)) // 0-20%
          );
          coverPath = uploadUrlsRes.cover.path;
        }

        // 3. Upload Preview MP3 directly from browser to Supabase Storage (rgodbeat-public)
        if (previewState.file && uploadUrlsRes.preview) {
          setUploadProgressStatus("Step 2/3: Uploading streaming MP3 preview...");
          await uploadFileToSignedUrl(
            uploadUrlsRes.preview.signedUrl,
            previewState.file,
            previewState.file.type || "audio/mpeg",
            (pct) => setUploadPercent(20 + Math.round(pct * 0.3)) // 20-50%
          );
          previewPath = uploadUrlsRes.preview.path;
        }

        // 4. Upload Master WAV directly from browser to Supabase Storage (rgodbeat-private)
        if (wavState.file && uploadUrlsRes.wav) {
          setUploadProgressStatus("Step 3/3: Uploading 24-bit Master WAV...");
          await uploadFileToSignedUrl(
            uploadUrlsRes.wav.signedUrl,
            wavState.file,
            "audio/wav",
            (pct) => {
              setUploadPercent(50 + Math.round(pct * 0.45)); // 50-95%
              setUploadProgressStatus(`Step 3/3: Uploading Master WAV (${pct}%)...`);
            }
          );
          wavPath = uploadUrlsRes.wav.path;
        }

        // 5. Finalize beat registration in database
        setUploadProgressStatus("Finalizing beat and licenses in catalog...");
        setUploadPercent(98);

        const licensesPayload = Object.entries(selectedLicenses)
          .filter(([_, conf]) => conf.enabled)
          .map(([id, conf]) => ({
            licenseTypeId: id,
            priceOverride: conf.overridePrice ? parseFloat(conf.overridePrice) : null,
          }));

        const res = await createBeatDirectAction({
          beatId,
          title,
          slug,
          description,
          genreId,
          mood,
          bpm: bpm ? parseInt(bpm, 10) : null,
          key,
          duration,
          featured,
          published: publishImmediate,
          coverPath,
          previewPath,
          previewFileSize: previewState.file?.size || null,
          wavPath,
          wavFileName: wavState.file?.name || null,
          wavFileSize: wavState.file?.size || null,
          licenses: licensesPayload,
        });

        if (!res.success) {
          throw new Error(res.error || "Failed to record beat in database.");
        }

        setUploadPercent(100);
        setUploadProgressStatus("Beat created successfully! Redirecting...");
        router.push("/admin/beats");
        router.refresh();
      } catch (err: any) {
        console.error("[NewBeatForm] Upload error:", err);
        setFormError(err.message || "An error occurred while uploading the beat.");
        setUploadProgressStatus(null);
        setUploadPercent(null);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-[11px] font-mono tracking-[0.22em] text-purple-400 uppercase">
              STUDIO CATALOG // NEW RELEASE
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase mt-1">
            New Beat
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            CREATE AND ENROLL AN INSTRUMENTAL INTO RGODBEAT 2.0
          </p>
        </div>

        <div>
          <Link
            href="/admin/beats"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white font-mono text-xs uppercase tracking-wider border border-white/[0.08] transition-all"
          >
            ← CANCEL
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
            <strong className="block font-bold text-red-200">Unable to save beat</strong>
            <span>{formError}</span>
          </div>
        </div>
      )}

      {/* Progress Toast with Visual Bar */}
      {uploadProgressStatus && (
        <div className="p-5 rounded-2xl bg-purple-950/40 border border-purple-500/40 text-xs text-purple-200 space-y-3 shadow-xl shadow-purple-900/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
              <span className="font-mono font-bold uppercase tracking-wider">{uploadProgressStatus}</span>
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

      {/* 1. BASIC INFORMATION */}
      <section className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] space-y-6">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            1. Basic Information
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            Core metadata and musical classification
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
              onChange={handleTitleChange}
              placeholder="e.g. Midnight Dynasty"
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-sm text-white placeholder:text-zinc-600 font-mono transition-all"
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
                onChange={handleSlugChange}
                placeholder="midnight-dynasty"
                className="w-full px-3 py-2.5 rounded-r-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 font-mono transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Description / Production Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Atmospheric sound design notes, intended artist pockets, sample inspirations..."
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 font-mono transition-all resize-y"
            />
          </div>

          {/* Genre */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Genre <span className="text-purple-400">*</span>
            </label>
            <select
              value={genreId}
              onChange={(e) => setGenreId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white font-mono uppercase cursor-pointer"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#121218] text-white">
                  {c.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Mood */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Mood
            </label>
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="e.g. Dark, Melodic, Energetic"
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          {/* BPM */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-zinc-400 uppercase tracking-wider block">
              Tempo (BPM) <span className="text-purple-400">*</span>
            </label>
            <input
              type="number"
              min="40"
              max="240"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white font-mono transition-all"
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
              placeholder="e.g. Fm, Cm, Am"
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 font-mono transition-all"
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
              placeholder="3:00"
              className="w-full px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white placeholder:text-zinc-600 font-mono transition-all"
            />
          </div>

          {/* Featured */}
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="featured-checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
            />
            <label htmlFor="featured-checkbox" className="text-xs font-mono text-zinc-300 cursor-pointer select-none">
              Feature on Storefront & Homepage
            </label>
          </div>
        </div>
      </section>

      {/* 2. MEDIA ASSETS UPLOAD (Multi-Bucket Architecture) */}
      <section className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] space-y-6">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            2. Audio & Media Assets
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            Targeted buckets: rgodbeat-public (covers & preview MP3) and rgodbeat-private (master WAV)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Cover Artwork */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block">
                PUBLIC BUCKET
              </span>
              <h3 className="text-xs font-bold text-white uppercase">Cover Artwork</h3>
              <p className="text-[11px] text-zinc-400">1:1 square image (.jpg, .png, .webp). Max 15MB.</p>
            </div>

            <div className="pt-2">
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setCoverState({ file: f, status: f ? "selected" : "idle" });
                  }}
                  className="hidden"
                />
                <div
                  className={`p-3 rounded-lg border text-center transition-all ${
                    coverState.file
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <span className="text-xs font-mono block truncate">
                    {coverState.file ? `✓ ${coverState.file.name}` : "+ CHOOSE COVER"}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Preview Audio */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider block">
                  PUBLIC STREAMING
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                  MP3 320KBPS
                </span>
              </div>
              <h3 className="text-xs font-bold text-white uppercase">Preview Audio (MP3) <span className="text-purple-400">*</span></h3>
              <p className="text-[11px] text-zinc-400">
                Audio MP3 optimizado para reproducción instantánea en la web y entrega de licencia MP3.
              </p>
            </div>

            <div className="pt-2">
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="audio/mpeg,audio/mp3"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setPreviewState({ file: f, status: f ? "selected" : "idle" });
                    if (f) detectDuration(f);
                  }}
                  className="hidden"
                />
                <div
                  className={`p-3 rounded-lg border text-center transition-all ${
                    previewState.file
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <span className="text-xs font-mono block truncate">
                    {previewState.file
                      ? `✓ ${previewState.file.name}`
                      : "+ ELEGIR AUDIO MP3"}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Master WAV */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block">
                PRIVATE BUCKET (PROTECTED)
              </span>
              <h3 className="text-xs font-bold text-white uppercase">Master Audio (WAV)</h3>
              <p className="text-[11px] text-zinc-400">Full 24-bit studio WAV file (.wav). Max 2GB.</p>
            </div>

            <div className="pt-2">
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept="audio/wav,audio/x-wav"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setWavState({ file: f, status: f ? "selected" : "idle" });
                    if (f) detectDuration(f);
                  }}
                  className="hidden"
                />
                <div
                  className={`p-3 rounded-lg border text-center transition-all ${
                    wavState.file
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : "bg-white/[0.03] border-white/[0.08] text-zinc-400 hover:border-white/20"
                  }`}
                >
                  <span className="text-xs font-mono block truncate">
                    {wavState.file ? `✓ ${wavState.file.name}` : "+ CHOOSE WAV"}
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* 3. COMMERCIAL LICENSES */}
      <section className="p-6 sm:p-8 rounded-2xl bg-[#0e0e14] border border-white/[0.08] space-y-6">
        <div className="border-b border-white/[0.06] pb-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            3. Commercial Licensing Options
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">
            Select enabled license tiers and set optional beat-specific price overrides
          </p>
        </div>

        <div className="space-y-3">
          {licenseTypes.map((lic) => {
            const isEnabled = selectedLicenses[lic.id]?.enabled;
            const override = selectedLicenses[lic.id]?.overridePrice || "";

            return (
              <div
                key={lic.id}
                className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isEnabled
                    ? "bg-white/[0.02] border-white/[0.08]"
                    : "bg-black/20 border-white/[0.03] opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`lic-${lic.id}`}
                    checked={isEnabled}
                    onChange={() => handleLicenseToggle(lic.id)}
                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                  />
                  <label htmlFor={`lic-${lic.id}`} className="cursor-pointer">
                    <span className="text-xs font-mono font-bold text-white uppercase block">
                      {lic.name} ({lic.slug})
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">
                      Standard base price: {formatCurrency(lic.price)}
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2 pl-7 sm:pl-0">
                  <span className="text-xs font-mono text-zinc-400">Override: $</span>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!isEnabled}
                    value={override}
                    onChange={(e) => handlePriceOverrideChange(lic.id, e.target.value)}
                    placeholder={lic.price.toString()}
                    className="w-24 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] focus:border-purple-500 focus:outline-none text-xs text-white font-mono disabled:opacity-40"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. ACTIONS & WORKFLOW */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-4 border-t border-white/[0.08]">
        {/* Save as Draft */}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={isPending}
          onClick={() => handleSubmit(false)}
          className="w-full sm:w-auto font-mono text-xs uppercase tracking-wider font-bold"
        >
          SAVE AS DRAFT
        </Button>

        {/* Publish Immediately */}
        <Button
          type="button"
          variant="primary"
          size="lg"
          disabled={isPending}
          onClick={() => handleSubmit(true)}
          className="w-full sm:w-auto font-mono text-xs uppercase tracking-wider font-bold shadow-lg shadow-purple-600/20"
        >
          PUBLISH BEAT NOW →
        </Button>
      </div>
    </div>
  );
}
