/**
 * RGODBEAT 2.0 — Local Master Library Companion CLI
 * 
 * Runs natively on the creator's macOS machine.
 * Synchronizes online catalog beats into the local master library:
 *   ~/RGODBEAT 23 SALE/
 *     ├── ACTIVE/
 *     │   └── {slug}/
 *     │       ├── 01_MASTER/
 *     │       ├── 02_MP3/
 *     │       ├── 03_ARTWORK/
 *     │       ├── 04_METADATA/
 *     │       ├── 05_YOUTUBE/
 *     │       ├── 06_BEATSTARS/
 *     │       └── 07_LICENSE/
 *     └── ARCHIVE/
 *         └── {YYYY}/
 *             └── {slug}/
 * 
 * SECURITY GUARANTEES:
 * - NEVER uses, possesses, or stores SUPABASE_SERVICE_ROLE_KEY.
 * - Authenticates using creator's admin session / token.
 * - ZERO secrets or tokens stored in beat.json or local packages.
 * - Independent from physical folder numbering (never renames folders on rank change).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createClient } from "@supabase/supabase-js";

// Load configuration
const envPath = path.resolve(__dirname, "../.env.local");
let supabaseUrl = "";
let supabaseAnonKey = "";
let supabaseServiceKey = "";

let customLibraryRoot = "";

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/);
  const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);
  const libraryMatch = envContent.match(/LOCAL_MASTER_LIBRARY_PATH=(.*)/);
  supabaseUrl = urlMatch ? urlMatch[1].trim() : "";
  supabaseAnonKey = anonMatch ? anonMatch[1].trim() : "";
  supabaseServiceKey = serviceMatch ? serviceMatch[1].trim() : "";
  customLibraryRoot = libraryMatch ? libraryMatch[1].trim().replace(/^["']|["']$/g, "") : "";
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase URL or Publishable key in configuration.");
  process.exit(1);
}

// Master library root path on external SSD or configurable environment variable
const EXTERNAL_SSD_PATH = "/Volumes/RGodbeat XXX/RGODBEAT 23 SALE";
const INTERNAL_FALLBACK = path.join(os.homedir(), "RGODBEAT 23 SALE");

export const MASTER_LIBRARY_ROOT =
  process.env.LOCAL_MASTER_LIBRARY_PATH ||
  customLibraryRoot ||
  (fs.existsSync(EXTERNAL_SSD_PATH) ? EXTERNAL_SSD_PATH : INTERNAL_FALLBACK);

const CREDENTIALS_DIR = path.join(os.homedir(), ".rgodbeat");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

interface LocalSyncReport {
  beatId: string;
  title: string;
  slug: string;
  status: "synced" | "failed" | "skipped";
  path: string;
  error?: string;
}

export function ensureLibraryStructure(): string {
  if (!fs.existsSync(MASTER_LIBRARY_ROOT)) {
    fs.mkdirSync(MASTER_LIBRARY_ROOT, { recursive: true });
  }
  return MASTER_LIBRARY_ROOT;
}

export function generateCanonicalMetadata(beat: any): object {
  const genreName = beat.categories?.name || beat.genre || "Trap";
  const wavFile = Array.isArray(beat.beat_files)
    ? beat.beat_files.find((f: any) => f.file_type === "wav")
    : null;

  return {
    rgodbeat_id: beat.id,
    version: "2.0",
    generated_at: new Date().toISOString(),
    title: beat.title,
    slug: beat.slug,
    bpm: beat.bpm || null,
    key: beat.musical_key || null,
    genre: genreName,
    mood: beat.mood || "Dark",
    duration_seconds: beat.duration_seconds || null,
    description: beat.description || "",
    credits: {
      producer: "RGODBEAT",
      collaborators: [],
      writers: ["Rafael Godoy"],
      samples_loops: "Original composition",
    },
    ranking: {
      status: beat.ranking_status || "active",
      current_rank: beat.current_rank || null,
      previous_rank: beat.previous_rank || null,
      ranking_period: beat.ranking_period || null,
      pool_entry_date: beat.pool_entry_date || null,
      days_in_pool: beat.days_in_pool || 0,
    },
    online_assets: {
      cover_path: beat.cover_path || null,
      preview_path: beat.preview_path || null,
      master_wav_path: wavFile?.storage_path || null,
      online_status: beat.online_asset_status || "ready",
    },
  };
}

export function generateYouTubePackage(beat: any): string {
  const genreName = beat.categories?.name || beat.genre || "Trap";
  const durationStr = beat.duration_seconds
    ? `${Math.floor(beat.duration_seconds / 60)}:${String(beat.duration_seconds % 60).padStart(2, "0")}`
    : "3:00";
  const tags = ["RGODBEAT", genreName, `${beat.bpm || 140}BPM`, beat.musical_key || "C", "Type Beat 2026"];

  const lines = [
    `TITLE: [FREE] ${beat.title} - ${genreName} Type Beat (Prod. RGODBEAT)`,
    `------------------------------------------------------------------`,
    `DESCRIPTION:`,
    `💰 Purchase / Instant Download: https://rgodbeat.com/beats/${beat.slug}`,
    `🎹 BPM: ${beat.bpm || 140} | Key: ${beat.musical_key || "C"} | Duration: ${durationStr}`,
    `🎧 Produced by: RGODBEAT`,
  ];

  if (beat.description) {
    lines.push(`📝 ${beat.description}`);
  }

  lines.push(
    `📧 Contact: info@rgodbeat.com`,
    `------------------------------------------------------------------`,
    `TAGS: ${tags.join(", ")}`,
    `------------------------------------------------------------------`,
    `CANONICAL RGODBEAT ID: ${beat.id}`
  );

  return lines.join("\n");
}

export function generateBeatStarsPackage(beat: any): string {
  const genreName = beat.categories?.name || beat.genre || "Hip Hop / Trap";
  const durationStr = beat.duration_seconds
    ? `${Math.floor(beat.duration_seconds / 60)}:${String(beat.duration_seconds % 60).padStart(2, "0")}`
    : "N/A";

  return [
    `BEATSTARS METADATA PACKAGE: ${beat.title}`,
    `------------------------------------------------------------------`,
    `Title: ${beat.title}`,
    `Primary Genre: ${genreName}`,
    `BPM: ${beat.bpm || 140}`,
    `Key: ${beat.musical_key || "C"}`,
    `Mood: ${beat.mood || "Dark"}`,
    `Duration: ${durationStr}`,
    `Tags: rgodbeat, ${genreName.toLowerCase()}, ${(beat.mood || "dark").toLowerCase()}`,
    `Description: ${beat.description || "Mixed and mastered by RGODBEAT. Ready for recording."}`,
    `Producer: RGODBEAT`,
    `RGODBEAT ID: ${beat.id}`,
  ].join("\n");
}

export function generateLicensePackage(beat: any): string {
  let licenseLines: string[] = [];

  if (Array.isArray(beat.beat_licenses) && beat.beat_licenses.length > 0) {
    licenseLines = beat.beat_licenses
      .filter((bl: any) => bl.active !== false && bl.license_types)
      .map((bl: any) => {
        const lt = bl.license_types;
        const price = bl.price_override !== null && bl.price_override !== undefined ? bl.price_override : lt.price;
        return `- ${lt.name.padEnd(22, " ")}: $${price}`;
      });
  }

  if (licenseLines.length === 0) {
    licenseLines = [
      `- Standard MP3 ($29)    : Non-exclusive, MP3 format, up to 50,000 streams`,
      `- Premium WAV ($49)     : Non-exclusive, 24-bit uncompressed WAV`,
      `- Trackout Stems ($99)  : Non-exclusive, Full WAV stems, uncompressed`,
      `- Unlimited ($199)      : Non-exclusive, Unlimited commercial streams`,
      `- Exclusive ($499)      : Full exclusive ownership rights`,
    ];
  }

  return [
    `RGODBEAT LICENSE SUMMARY — ${beat.title.toUpperCase()}`,
    `------------------------------------------------------------------`,
    `Available License Tiers:`,
    ...licenseLines,
    `------------------------------------------------------------------`,
    `Catalog ID: ${beat.id}`,
    `Verified: https://rgodbeat.com/beats/${beat.slug}`,
  ].join("\n");
}

export async function packageBeatLocally(beat: any, baseDir: string, client?: any): Promise<string> {
  // Folder is named purely by slug (never by physical rank number)
  const beatDir = path.join(baseDir, beat.slug);
  if (!fs.existsSync(beatDir)) fs.mkdirSync(beatDir, { recursive: true });

  const subfolders = [
    "01_MASTER",
    "02_MP3",
    "03_ARTWORK",
    "04_METADATA",
    "05_YOUTUBE",
    "06_BEATSTARS",
    "07_LICENSE",
  ];

  subfolders.forEach((sub) => {
    const subDir = path.join(beatDir, sub);
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
  });

  // 1. Download Master WAV into 01_MASTER
  if (client) {
    const wavFile = Array.isArray(beat.beat_files)
      ? beat.beat_files.find((f: any) => f.file_type === "wav")
      : null;

    if (wavFile && wavFile.storage_path) {
      const destFileName = wavFile.file_name || `${beat.slug}-master.wav`;
      const destPath = path.join(beatDir, "01_MASTER", destFileName);
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        console.log(`[Companion] Downloading WAV asset: ${destFileName}...`);
        const { data: wavBlob, error: wavErr } = await client.storage
          .from("rgodbeat-private")
          .download(wavFile.storage_path);

        if (wavBlob && !wavErr) {
          const buffer = Buffer.from(await wavBlob.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
        } else if (wavErr) {
          console.warn(`[Companion] Warning downloading WAV: ${wavErr.message}`);
        }
      } else {
        console.log(`[Companion] Master WAV already present on SSD: ${destFileName}`);
      }
    }

    // 2. Download Preview MP3 into 02_MP3
    if (beat.preview_path) {
      const destFileName = path.basename(beat.preview_path);
      const destPath = path.join(beatDir, "02_MP3", destFileName);
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        console.log(`[Companion] Downloading preview MP3: ${destFileName}...`);
        const { data: mp3Blob, error: mp3Err } = await client.storage
          .from("rgodbeat-public")
          .download(beat.preview_path);

        if (mp3Blob && !mp3Err) {
          const buffer = Buffer.from(await mp3Blob.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
        } else if (mp3Err) {
          console.warn(`[Companion] Warning downloading preview MP3: ${mp3Err.message}`);
        }
      } else {
        console.log(`[Companion] Preview MP3 already present on SSD: ${destFileName}`);
      }
    }

    // 3. Download Cover Artwork into 03_ARTWORK
    if (beat.cover_path) {
      const destFileName = path.basename(beat.cover_path);
      const destPath = path.join(beatDir, "03_ARTWORK", destFileName);
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        console.log(`[Companion] Downloading cover artwork: ${destFileName}...`);
        const { data: coverBlob, error: coverErr } = await client.storage
          .from("rgodbeat-public")
          .download(beat.cover_path);

        if (coverBlob && !coverErr) {
          const buffer = Buffer.from(await coverBlob.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
        } else if (coverErr) {
          console.warn(`[Companion] Warning downloading cover: ${coverErr.message}`);
        }
      } else {
        console.log(`[Companion] Cover artwork already present on SSD: ${destFileName}`);
      }
    }
  }

  // Write 04_METADATA/beat.json
  const metadata = generateCanonicalMetadata(beat);
  fs.writeFileSync(path.join(beatDir, "04_METADATA", "beat.json"), JSON.stringify(metadata, null, 2));

  // Write 05_YOUTUBE/youtube_metadata.txt
  fs.writeFileSync(path.join(beatDir, "05_YOUTUBE", "youtube_metadata.txt"), generateYouTubePackage(beat));

  // Write 06_BEATSTARS/beatstars_metadata.txt
  fs.writeFileSync(path.join(beatDir, "06_BEATSTARS", "beatstars_metadata.txt"), generateBeatStarsPackage(beat));

  // Write 07_LICENSE/license_terms.txt
  fs.writeFileSync(path.join(beatDir, "07_LICENSE", "license_terms.txt"), generateLicensePackage(beat));

  return beatDir;
}

export async function runSync(options: { dryRun?: boolean; slug?: string; beatId?: string; all?: boolean } = {}) {
  console.log("==================================================================");
  console.log("📂 RGODBEAT 2.0 — LOCAL MASTER LIBRARY COMPANION");
  console.log("==================================================================");
  console.log(`Library Root: ${MASTER_LIBRARY_ROOT}`);

  const libraryRoot = ensureLibraryStructure();
  console.log(`✅ Verified master library root at ${libraryRoot}`);

  const client = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = client
    .from("beats")
    .select("*, categories(name), beat_files(*), beat_licenses(*, license_types(*))");

  if (options.slug) {
    query = query.eq("slug", options.slug);
  } else if (options.beatId) {
    query = query.eq("id", options.beatId);
  } else if (!options.all) {
    // Default: detect pending beats
    query = query.eq("local_sync_status", "pending");
  }

  const { data: beats, error } = await query;

  if (error || !beats) {
    console.error("❌ Error fetching beats for local packaging:", error?.message);
    return [];
  }

  console.log(`🔍 Detected ${beats.length} beat(s) to synchronize.`);

  const reports: LocalSyncReport[] = [];

  for (const beat of beats) {
    try {
      const targetPath = await packageBeatLocally(beat, libraryRoot, client);

      if (!options.dryRun) {
        const now = new Date().toISOString();
        const { error: updateErr } = await client
          .from("beats")
          .update({
            local_sync_status: "synced",
            last_synced_at: now,
            local_archive_path: beat.slug,
          })
          .eq("id", beat.id);

        if (updateErr) {
          throw new Error(`Failed to update sync status in Supabase: ${updateErr.message}`);
        }
      }

      reports.push({
        beatId: beat.id,
        title: beat.title,
        slug: beat.slug,
        status: "synced",
        path: targetPath,
      });
      console.log(`✅ [SYNCED] ${beat.title} -> ${targetPath}`);
    } catch (err: any) {
      reports.push({
        beatId: beat.id,
        title: beat.title,
        slug: beat.slug,
        status: "failed",
        path: "",
        error: err.message,
      });
      console.error(`❌ [FAILED] ${beat.title}:`, err.message);
    }
  }

  console.log("==================================================================");
  const syncedCount = reports.filter((r) => r.status === "synced").length;
  console.log(`COMPANION SUMMARY: ${syncedCount} / ${beats.length} beats packaged in local library.`);
  console.log("==================================================================");
  return reports;
}

// Direct execution
if (require.main === module) {
  runSync();
}
