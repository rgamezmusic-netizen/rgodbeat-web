import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createClient } from "@supabase/supabase-js";
import { runSync, MASTER_LIBRARY_ROOT } from "./sync-companion";

// Load environment configuration
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/);
const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !anonMatch || !serviceMatch) {
  console.error("❌ Missing required Supabase credentials in .env.local");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseAnonKey = anonMatch[1].trim();
const supabaseServiceKey = serviceMatch[1].trim();

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const publicClient = createClient(supabaseUrl, supabaseAnonKey);

const REAL_COVER_SRC = "/Volumes/RGodbeat XXX/GALERY BEATS /IMAGENES/image.jpg";
const REAL_MP3_SRC = "/Volumes/RGodbeat XXX/MUSIC_PRODUCTION/EXPORTS/MP3/CharDB.mp3";
const REAL_WAV_SRC = "/Volumes/RGodbeat XXX/STEMS/First Millons/FM 3-808 EXPLOSIVO LORY JAMES (2).wav";


interface StepReport {
  beatId: string;
  slug: string;
  supabaseRecordStatus: string;
  storageFilesCreated: string[];
  localSyncStatusBefore: string;
  localFolderPath: string;
  sevenFoldersCreated: boolean;
  foldersList: string[];
  metadataFileCreated: boolean;
  beatIdInsideMetadata: string;
  localSyncStatusAfter: string;
  lastSyncedAt: string;
  secondRunDuplicatesCreated: boolean;
  errors: string[];
}

async function runRealBeatEndToEndTest() {
  console.log("==================================================================");
  console.log("🎵 RGODBEAT 2.0 — STEP 9 REAL FIRST BEAT END-TO-END TEST");
  console.log("==================================================================");

  const report: StepReport = {
    beatId: "",
    slug: "",
    supabaseRecordStatus: "",
    storageFilesCreated: [],
    localSyncStatusBefore: "",
    localFolderPath: "",
    sevenFoldersCreated: false,
    foldersList: [],
    metadataFileCreated: false,
    beatIdInsideMetadata: "",
    localSyncStatusAfter: "",
    lastSyncedAt: "",
    secondRunDuplicatesCreated: false,
    errors: [],
  };

  const testTitle = "RGODBEAT TEST 001";
  const testSlug = "rgodbeat-test-001";

  try {
    // -------------------------------------------------------------
    // Step 0: Clean up any previous test artifacts
    // -------------------------------------------------------------
    console.log("🧹 Pre-cleanup: checking for existing test beat...");
    const { data: existingBeats } = await adminClient
      .from("beats")
      .select("id, slug, cover_path, preview_path, beat_files(storage_path)")
      .eq("slug", testSlug);

    if (existingBeats && existingBeats.length > 0) {
      for (const eb of existingBeats) {
        if (eb.cover_path) await adminClient.storage.from("rgodbeat-public").remove([eb.cover_path]);
        if (eb.preview_path) await adminClient.storage.from("rgodbeat-public").remove([eb.preview_path]);
        if (Array.isArray(eb.beat_files)) {
          for (const bf of eb.beat_files) {
            if (bf.storage_path) await adminClient.storage.from("rgodbeat-private").remove([bf.storage_path]);
          }
        }
        await adminClient.from("beats").delete().eq("id", eb.id);
      }
    }

    const testLocalFolder = path.join(MASTER_LIBRARY_ROOT, testSlug);
    if (fs.existsSync(testLocalFolder)) {
      fs.rmSync(testLocalFolder, { recursive: true, force: true });
    }

    // Verify source media files exist
    if (!fs.existsSync(REAL_COVER_SRC)) throw new Error(`Cover source not found: ${REAL_COVER_SRC}`);
    if (!fs.existsSync(REAL_MP3_SRC)) throw new Error(`MP3 source not found: ${REAL_MP3_SRC}`);
    if (!fs.existsSync(REAL_WAV_SRC)) throw new Error(`WAV source not found: ${REAL_WAV_SRC}`);

    console.log("✅ Verified real source files:");
    console.log(`   Cover: ${REAL_COVER_SRC} (${(fs.statSync(REAL_COVER_SRC).size / 1024).toFixed(1)} KB)`);
    console.log(`   MP3:   ${REAL_MP3_SRC} (${(fs.statSync(REAL_MP3_SRC).size / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`   WAV:   ${REAL_WAV_SRC} (${(fs.statSync(REAL_WAV_SRC).size / (1024 * 1024)).toFixed(2)} MB)`);

    // Fetch genre and licenses
    const { data: genres } = await adminClient.from("categories").select("id, slug").limit(1);
    const genreId = genres?.[0]?.id;

    const { data: licenseTypes } = await adminClient.from("license_types").select("id, slug, price");
    if (!licenseTypes || licenseTypes.length === 0) throw new Error("No license types found in database");

    // -------------------------------------------------------------
    // Step 1: Admin Upload Simulation (Full exact chain)
    // -------------------------------------------------------------
    console.log("\n--- STEP 1: ADMIN UPLOAD ---");
    // 1.1 Insert beat row
    const { data: newBeat, error: insertError } = await adminClient
      .from("beats")
      .insert({
        title: testTitle,
        slug: testSlug,
        description: "Official real beat test release for RGODBEAT 23 SALE Master Library",
        genre_id: genreId,
        mood: "Dark",
        bpm: 130,
        musical_key: "Eb",
        duration_seconds: 195,
        featured: true,
        published: true,
        ranking_status: "new",
        local_sync_status: "pending",
      })
      .select("*")
      .single();

    if (insertError || !newBeat) {
      throw new Error(`Failed to create beat record: ${insertError?.message}`);
    }

    const beatId = newBeat.id;
    report.beatId = beatId;
    report.slug = testSlug;
    console.log(`✅ Permanent Beat ID generated: ${beatId}`);
    console.log(`✅ Stable Slug generated: ${testSlug}`);

    // 1.2 Upload Cover Artwork to rgodbeat-public
    const coverExt = path.extname(REAL_COVER_SRC).replace(".", "") || "jpg";
    const coverStoragePath = `covers/${beatId}/cover.${coverExt}`;
    const coverBuffer = fs.readFileSync(REAL_COVER_SRC);

    const { error: coverErr } = await adminClient.storage
      .from("rgodbeat-public")
      .upload(coverStoragePath, coverBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (coverErr) throw new Error(`Cover upload failed: ${coverErr.message}`);
    report.storageFilesCreated.push(`rgodbeat-public/${coverStoragePath}`);
    console.log(`✅ Cover uploaded -> rgodbeat-public/${coverStoragePath}`);

    // 1.3 Upload Preview MP3 to rgodbeat-public
    const previewStoragePath = `previews/${beatId}/preview.mp3`;
    const previewBuffer = fs.readFileSync(REAL_MP3_SRC);

    const { error: previewErr } = await adminClient.storage
      .from("rgodbeat-public")
      .upload(previewStoragePath, previewBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (previewErr) throw new Error(`Preview MP3 upload failed: ${previewErr.message}`);
    report.storageFilesCreated.push(`rgodbeat-public/${previewStoragePath}`);
    console.log(`✅ Preview MP3 uploaded -> rgodbeat-public/${previewStoragePath}`);

    // 1.4 Upload Master WAV to rgodbeat-private
    const wavFileName = path.basename(REAL_WAV_SRC);
    const wavStoragePath = `beats/${beatId}/wav/${wavFileName}`;
    const wavBuffer = fs.readFileSync(REAL_WAV_SRC);

    const { error: wavErr } = await adminClient.storage
      .from("rgodbeat-private")
      .upload(wavStoragePath, wavBuffer, {
        contentType: "audio/wav",
        upsert: true,
      });

    if (wavErr) throw new Error(`Master WAV upload failed: ${wavErr.message}`);
    report.storageFilesCreated.push(`rgodbeat-private/${wavStoragePath}`);
    console.log(`✅ Master WAV uploaded -> rgodbeat-private/${wavStoragePath}`);

    // 1.5 Create beat_files record
    const { error: fileErr } = await adminClient.from("beat_files").insert({
      beat_id: beatId,
      file_type: "wav",
      storage_path: wavStoragePath,
      file_name: wavFileName,
      mime_type: "audio/wav",
      file_size: wavBuffer.length,
    });

    if (fileErr) throw new Error(`beat_files record creation failed: ${fileErr.message}`);
    console.log(`✅ beat_files record created (WAV, ${wavBuffer.length} bytes)`);

    // 1.6 Create beat_licenses records
    const licenseRows = licenseTypes.map((lt) => ({
      beat_id: beatId,
      license_type_id: lt.id,
      price_override: null,
      active: true,
    }));

    const { error: licErr } = await adminClient.from("beat_licenses").insert(licenseRows);
    if (licErr) throw new Error(`beat_licenses creation failed: ${licErr.message}`);
    console.log(`✅ beat_licenses records created (${licenseRows.length} tiers)`);

    // 1.7 Finalize beat record with asset paths
    const { error: finalizeErr } = await adminClient
      .from("beats")
      .update({
        cover_path: coverStoragePath,
        preview_path: previewStoragePath,
        published: true,
        local_sync_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", beatId);

    if (finalizeErr) throw new Error(`Beat record finalization failed: ${finalizeErr.message}`);

    // -------------------------------------------------------------
    // Step 2: Verify state BEFORE Companion
    // -------------------------------------------------------------
    console.log("\n--- STEP 2: VERIFY SUPABASE BEFORE COMPANION ---");
    const { data: beatBeforeSync } = await adminClient
      .from("beats")
      .select("id, slug, published, ranking_status, local_sync_status, last_synced_at")
      .eq("id", beatId)
      .single();

    report.supabaseRecordStatus = `published: ${beatBeforeSync?.published}, ranking: ${beatBeforeSync?.ranking_status}`;
    report.localSyncStatusBefore = beatBeforeSync?.local_sync_status || "unknown";

    console.log(`✅ Supabase Record: ${report.supabaseRecordStatus}`);
    console.log(`✅ local_sync_status BEFORE Companion: "${report.localSyncStatusBefore}"`);

    if (report.localSyncStatusBefore !== "pending") {
      throw new Error(`Expected local_sync_status to be 'pending', got '${report.localSyncStatusBefore}'`);
    }

    // -------------------------------------------------------------
    // Step 3: Run Companion Sync
    // -------------------------------------------------------------
    console.log("\n--- STEP 3: COMPANION DETECTS AND PACKAGES BEAT ---");
    const syncReports = await runSync({ slug: testSlug });
    const syncedBeatReport = syncReports.find((r) => r.beatId === beatId);

    if (!syncedBeatReport || syncedBeatReport.status !== "synced") {
      throw new Error(`Companion sync failed: ${syncedBeatReport?.error || "Unknown error"}`);
    }

    report.localFolderPath = syncedBeatReport.path;
    console.log(`✅ Companion processed beat to: ${report.localFolderPath}`);

    // -------------------------------------------------------------
    // Step 4: Verify Local Master Library Package
    // -------------------------------------------------------------
    console.log("\n--- STEP 4: VERIFY LOCAL FILESYSTEM STRUCTURE ---");
    const expectedFolders = [
      "01_MASTER",
      "02_MP3",
      "03_ARTWORK",
      "04_METADATA",
      "05_YOUTUBE",
      "06_BEATSTARS",
      "07_LICENSE",
    ];

    const actualItems = fs.readdirSync(report.localFolderPath);
    report.foldersList = expectedFolders.filter((f) => actualItems.includes(f));
    report.sevenFoldersCreated = expectedFolders.every((f) => actualItems.includes(f));

    console.log(`✅ Seven Folders Created: ${report.sevenFoldersCreated} (${report.foldersList.join(", ")})`);

    // Verify assets downloaded
    const masterFiles = fs.readdirSync(path.join(report.localFolderPath, "01_MASTER"));
    const mp3Files = fs.readdirSync(path.join(report.localFolderPath, "02_MP3"));
    const artworkFiles = fs.readdirSync(path.join(report.localFolderPath, "03_ARTWORK"));

    console.log(`   01_MASTER:  ${masterFiles.join(", ")}`);
    console.log(`   02_MP3:     ${mp3Files.join(", ")}`);
    console.log(`   03_ARTWORK: ${artworkFiles.join(", ")}`);

    // Verify 04_METADATA/beat.json
    const metadataPath = path.join(report.localFolderPath, "04_METADATA", "beat.json");
    report.metadataFileCreated = fs.existsSync(metadataPath);

    if (report.metadataFileCreated) {
      const metadataContent = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
      report.beatIdInsideMetadata = metadataContent.rgodbeat_id;
      console.log(`✅ Metadata file created at 04_METADATA/beat.json`);
      console.log(`✅ Beat ID found inside metadata: "${report.beatIdInsideMetadata}"`);
    }

    // -------------------------------------------------------------
    // Step 5: Verify state AFTER Companion
    // -------------------------------------------------------------
    console.log("\n--- STEP 5: VERIFY SUPABASE AFTER COMPANION ---");
    const { data: beatAfterSync } = await adminClient
      .from("beats")
      .select("id, slug, local_sync_status, last_synced_at, local_archive_path")
      .eq("id", beatId)
      .single();

    report.localSyncStatusAfter = beatAfterSync?.local_sync_status || "unknown";
    report.lastSyncedAt = beatAfterSync?.last_synced_at || "none";

    console.log(`✅ local_sync_status AFTER Companion: "${report.localSyncStatusAfter}"`);
    console.log(`✅ last_synced_at: "${report.lastSyncedAt}"`);
    console.log(`✅ local_archive_path: "${beatAfterSync?.local_archive_path}"`);

    // -------------------------------------------------------------
    // Step 6: Verify Idempotency / No Duplicates on Second Run
    // -------------------------------------------------------------
    console.log("\n--- STEP 6: IDEMPOTENCY / SECOND RUN TEST ---");
    const countBeforeSecondRun = (await adminClient.from("beats").select("id", { count: "exact" })).count;
    const foldersBeforeSecondRun = fs.readdirSync(MASTER_LIBRARY_ROOT);

    // Run sync again for the same beat
    await runSync({ slug: testSlug });

    const countAfterSecondRun = (await adminClient.from("beats").select("id", { count: "exact" })).count;
    const foldersAfterSecondRun = fs.readdirSync(MASTER_LIBRARY_ROOT);

    const sameDbCount = countBeforeSecondRun === countAfterSecondRun;
    const sameFolderCount = foldersBeforeSecondRun.length === foldersAfterSecondRun.length;

    report.secondRunDuplicatesCreated = !sameDbCount || !sameFolderCount;
    console.log(`✅ Second run duplicate check:`);
    console.log(`   DB beat count preserved: ${sameDbCount} (${countBeforeSecondRun} -> ${countAfterSecondRun})`);
    console.log(`   Library folder count preserved: ${sameFolderCount} (${foldersBeforeSecondRun.length} -> ${foldersAfterSecondRun.length})`);

    // Verify public queryability
    const { data: publicBeat } = await publicClient
      .from("beats")
      .select("id, slug, title, published")
      .eq("id", beatId)
      .single();

    console.log(`✅ Public Storefront verification: found "${publicBeat?.title}" (${publicBeat?.slug}) via anon key`);

    // -------------------------------------------------------------
    // FINAL PASS/FAIL EVALUATION
    // -------------------------------------------------------------
    const pass =
      report.beatId.length > 0 &&
      report.slug === testSlug &&
      report.localSyncStatusBefore === "pending" &&
      report.sevenFoldersCreated &&
      report.metadataFileCreated &&
      report.beatIdInsideMetadata === report.beatId &&
      report.localSyncStatusAfter === "synced" &&
      report.lastSyncedAt !== "none" &&
      !report.secondRunDuplicatesCreated &&
      report.errors.length === 0;

    console.log("\n==================================================================");
    console.log(`END-TO-END TEST RESULT: ${pass ? "🎉 PASS" : "❌ FAIL"}`);
    console.log("==================================================================");

    // Output JSON report for parsing
    fs.writeFileSync(
      path.join(__dirname, "step9-report.json"),
      JSON.stringify({ pass, report }, null, 2)
    );

    if (!pass) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("❌ Fatal error during test execution:", err.message);
    report.errors.push(err.message);
    fs.writeFileSync(
      path.join(__dirname, "step9-report.json"),
      JSON.stringify({ pass: false, report, fatal: err.message }, null, 2)
    );
    process.exit(1);
  }
}

runRealBeatEndToEndTest();
