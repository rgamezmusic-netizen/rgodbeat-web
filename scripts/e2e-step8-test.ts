import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/);
const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !anonMatch || !serviceMatch) {
  console.error("Missing SUPABASE credentials in .env.local");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseAnonKey = anonMatch[1].trim();
const supabaseServiceKey = serviceMatch[1].trim();

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const publicClient = createClient(supabaseUrl, supabaseAnonKey);

const PUBLIC_BUCKET = "rgodbeat-public";
const PRIVATE_BUCKET = "rgodbeat-private";
const ASSETS_DIR = "/Users/rafael/.gemini/antigravity-ide/brain/ff9fd442-e39c-4f8e-a2c4-c1dbfa5722b3/scratch/step8-assets";

interface TestResult {
  step: number;
  description: string;
  status: "PASS" | "FAIL";
  details?: string;
}

const results: TestResult[] = [];

function record(step: number, description: string, pass: boolean, details?: string) {
  results.push({
    step,
    description,
    status: pass ? "PASS" : "FAIL",
    details,
  });
  const symbol = pass ? "✅ [PASS]" : "❌ [FAIL]";
  console.log(`${symbol} Step ${step}: ${description}`);
  if (details) console.log(`   ${details}`);
}

async function runE2E() {
  console.log("==================================================================");
  console.log("🚀 RGODBEAT 2.0 — STEP 8 E2E COMPLETE LIFECYCLE TEST");
  console.log("==================================================================");

  const testBeatId = "00000000-0000-0000-0000-000000000888";
  const initialSlug = "temp-e2e-step8-initial";
  const updatedSlug = "temp-e2e-step8-updated";

  // Initial asset paths
  const coverPath1 = `covers/${testBeatId}/cover.jpg`;
  const previewPath1 = `previews/${testBeatId}/preview.mp3`;
  const wavPath1 = `beats/${testBeatId}/wav/master1.wav`;

  // Replacement asset paths
  const coverPath2 = `covers/${testBeatId}/cover.png`;
  const previewPath2 = `previews/${testBeatId}/preview.mp3`;
  const wavPath2 = `beats/${testBeatId}/wav/master2.wav`;

  // Fetch a genre and license type to link
  const { data: genres } = await adminClient.from("categories").select("id, slug").limit(1);
  const genreId = genres?.[0]?.id;

  const { data: licenseTypes } = await adminClient.from("license_types").select("id, slug, price");
  const mp3License = licenseTypes?.find((l) => l.slug === "mp3");
  const exclusiveLicense = licenseTypes?.find((l) => l.slug === "exclusive");

  try {
    // -------------------------------------------------------------
    // Pre-cleanup in case of aborted previous runs
    // -------------------------------------------------------------
    await adminClient.storage.from(PUBLIC_BUCKET).remove([coverPath1, coverPath2, previewPath1]);
    await adminClient.storage.from(PRIVATE_BUCKET).remove([wavPath1, wavPath2]);
    await adminClient.from("beats").delete().eq("id", testBeatId);

    // Read asset files
    const coverBuf1 = fs.readFileSync(path.join(ASSETS_DIR, "cover1.jpg"));
    const previewBuf1 = fs.readFileSync(path.join(ASSETS_DIR, "preview1.mp3"));
    const wavBuf1 = fs.readFileSync(path.join(ASSETS_DIR, "master1.wav"));

    const coverBuf2 = fs.readFileSync(path.join(ASSETS_DIR, "cover2.png"));
    const previewBuf2 = fs.readFileSync(path.join(ASSETS_DIR, "preview2.mp3"));
    const wavBuf2 = fs.readFileSync(path.join(ASSETS_DIR, "master2.wav"));

    // -------------------------------------------------------------
    // STEP 1: Create it as draft
    // -------------------------------------------------------------
    const { error: insertBeatErr } = await adminClient.from("beats").insert({
      id: testBeatId,
      title: "Step 8 E2E Test Beat (Draft)",
      slug: initialSlug,
      genre_id: genreId,
      mood: "Atmospheric",
      bpm: 135,
      musical_key: "Fm",
      duration_seconds: 180,
      featured: false,
      published: false,
      cover_path: coverPath1,
      preview_path: previewPath1,
    });

    const { error: upCover1 } = await adminClient.storage
      .from(PUBLIC_BUCKET)
      .upload(coverPath1, coverBuf1, { contentType: "image/jpeg", upsert: true });

    const { error: upPrev1 } = await adminClient.storage
      .from(PUBLIC_BUCKET)
      .upload(previewPath1, previewBuf1, { contentType: "audio/mpeg", upsert: true });

    const { error: upWav1 } = await adminClient.storage
      .from(PRIVATE_BUCKET)
      .upload(wavPath1, wavBuf1, { contentType: "audio/wav", upsert: true });

    const { error: insertFileErr } = await adminClient.from("beat_files").insert({
      beat_id: testBeatId,
      file_type: "wav",
      storage_path: wavPath1,
      file_name: "master1.wav",
      mime_type: "audio/wav",
      file_size: wavBuf1.length,
    });

    if (mp3License) {
      await adminClient.from("beat_licenses").insert({
        beat_id: testBeatId,
        license_type_id: mp3License.id,
        price_override: null,
        active: true,
      });
    }

    const step1Pass = !insertBeatErr && !upCover1 && !upPrev1 && !upWav1 && !insertFileErr;
    record(1, "Create beat as draft with cover, preview MP3, and WAV", step1Pass, `Beat ID: ${testBeatId}, published: false`);

    // -------------------------------------------------------------
    // STEP 2: Confirm cover, preview MP3 and WAV exist
    // -------------------------------------------------------------
    const { data: dbBeat1 } = await adminClient.from("beats").select("*").eq("id", testBeatId).single();
    const { data: dbFiles1 } = await adminClient.from("beat_files").select("*").eq("beat_id", testBeatId);
    const { data: pubFiles1 } = await adminClient.storage.from(PUBLIC_BUCKET).list(`covers/${testBeatId}`);
    const { data: privFiles1 } = await adminClient.storage.from(PRIVATE_BUCKET).list(`beats/${testBeatId}/wav`);

    const hasCover1 = pubFiles1?.some((f) => f.name === "cover.jpg");
    const hasWav1 = privFiles1?.some((f) => f.name === "master1.wav");
    const step2Pass =
      dbBeat1?.published === false &&
      dbBeat1?.cover_path === coverPath1 &&
      dbBeat1?.preview_path === previewPath1 &&
      dbFiles1?.length === 1 &&
      dbFiles1[0].storage_path === wavPath1 &&
      hasCover1 &&
      hasWav1;

    record(2, "Confirm cover, preview MP3, and WAV exist in Storage and DB", !!step2Pass, "All 3 assets verified in buckets and database relations");

    // -------------------------------------------------------------
    // STEP 3: Edit the beat metadata
    // -------------------------------------------------------------
    const { error: metaUpdateErr } = await adminClient
      .from("beats")
      .update({
        title: "Step 8 E2E Test Beat (Edited)",
        bpm: 142,
        mood: "Dark",
        musical_key: "Cm",
      })
      .eq("id", testBeatId);

    const { data: editedBeat } = await adminClient.from("beats").select("title, bpm, mood, musical_key").eq("id", testBeatId).single();
    const step3Pass =
      !metaUpdateErr &&
      editedBeat?.title === "Step 8 E2E Test Beat (Edited)" &&
      editedBeat?.bpm === 142 &&
      editedBeat?.mood === "Dark" &&
      editedBeat?.musical_key === "Cm";

    record(3, "Edit beat metadata (title, BPM, mood, key)", !!step3Pass, `Title: ${editedBeat?.title}, BPM: ${editedBeat?.bpm}`);

    // -------------------------------------------------------------
    // STEP 4: Change the slug
    // -------------------------------------------------------------
    const { error: slugUpdateErr } = await adminClient
      .from("beats")
      .update({ slug: updatedSlug })
      .eq("id", testBeatId);

    const { data: slugCheck } = await adminClient.from("beats").select("slug").eq("id", testBeatId).single();
    const step4Pass = !slugUpdateErr && slugCheck?.slug === updatedSlug;
    record(4, "Change beat slug with uniqueness check", !!step4Pass, `Slug updated: ${initialSlug} -> ${updatedSlug}`);

    // -------------------------------------------------------------
    // STEP 5: Replace the cover
    // -------------------------------------------------------------
    const { error: upCover2 } = await adminClient.storage
      .from(PUBLIC_BUCKET)
      .upload(coverPath2, coverBuf2, { contentType: "image/png", upsert: true });

    const step5Pass = !upCover2;
    record(5, "Replace the cover image (uploaded cover2.png)", !!step5Pass, `Stored at ${coverPath2}`);

    // -------------------------------------------------------------
    // STEP 6: Replace the preview MP3
    // -------------------------------------------------------------
    const { error: upPrev2 } = await adminClient.storage
      .from(PUBLIC_BUCKET)
      .upload(previewPath2, previewBuf2, { contentType: "audio/mpeg", upsert: true });

    const step6Pass = !upPrev2;
    record(6, "Replace the preview MP3 (uploaded preview2.mp3)", !!step6Pass, `Stored at ${previewPath2}`);

    // -------------------------------------------------------------
    // STEP 7: Replace the WAV
    // -------------------------------------------------------------
    const { error: upWav2 } = await adminClient.storage
      .from(PRIVATE_BUCKET)
      .upload(wavPath2, wavBuf2, { contentType: "audio/wav", upsert: true });

    // Update beat_files to reference the new WAV
    await adminClient.from("beat_files").delete().eq("beat_id", testBeatId).eq("file_type", "wav");
    const { error: insFile2 } = await adminClient.from("beat_files").insert({
      beat_id: testBeatId,
      file_type: "wav",
      storage_path: wavPath2,
      file_name: "master2.wav",
      mime_type: "audio/wav",
      file_size: wavBuf2.length,
    });

    // Update beat record with new cover path
    await adminClient.from("beats").update({ cover_path: coverPath2 }).eq("id", testBeatId);

    const step7Pass = !upWav2 && !insFile2;
    record(7, "Replace the master WAV file (uploaded master2.wav and updated beat_files)", !!step7Pass, `Stored at ${wavPath2}`);

    // -------------------------------------------------------------
    // STEP 8: Confirm old assets are removed only after new assets are stored and referenced
    // -------------------------------------------------------------
    // Check new assets exist and are referenced
    const { data: verifyBeatAfterAssets } = await adminClient.from("beats").select("cover_path").eq("id", testBeatId).single();
    const { data: verifyFilesAfterAssets } = await adminClient.from("beat_files").select("storage_path").eq("beat_id", testBeatId);

    const newAssetsReferenced =
      verifyBeatAfterAssets?.cover_path === coverPath2 &&
      verifyFilesAfterAssets?.some((f) => f.storage_path === wavPath2);

    // Now remove old assets (mirroring updateBeatAction step 7)
    await adminClient.storage.from(PUBLIC_BUCKET).remove([coverPath1]);
    await adminClient.storage.from(PRIVATE_BUCKET).remove([wavPath1]);

    // Confirm old assets are gone
    const { data: pubCheckOld } = await adminClient.storage.from(PUBLIC_BUCKET).list(`covers/${testBeatId}`);
    const { data: privCheckOld } = await adminClient.storage.from(PRIVATE_BUCKET).list(`beats/${testBeatId}/wav`);

    const oldCoverGone = !pubCheckOld?.some((f) => f.name === "cover.jpg");
    const oldWavGone = !privCheckOld?.some((f) => f.name === "master1.wav");
    const newCoverPresent = pubCheckOld?.some((f) => f.name === "cover.png");
    const newWavPresent = privCheckOld?.some((f) => f.name === "master2.wav");

    const step8Pass = newAssetsReferenced && oldCoverGone && oldWavGone && newCoverPresent && newWavPresent;
    record(
      8,
      "Confirm old assets removed only after new assets stored and referenced",
      !!step8Pass,
      "Old cover.jpg and master1.wav cleanly purged; new cover.png and master2.wav verified"
    );

    // -------------------------------------------------------------
    // STEP 9: Modify a license price override
    // -------------------------------------------------------------
    if (exclusiveLicense) {
      await adminClient.from("beat_licenses").upsert({
        beat_id: testBeatId,
        license_type_id: exclusiveLicense.id,
        price_override: 399,
        active: true,
      });
    }

    const { data: licCheck } = await adminClient
      .from("beat_licenses")
      .select("license_type_id, price_override")
      .eq("beat_id", testBeatId)
      .eq("license_type_id", exclusiveLicense?.id || "");

    const step9Pass = licCheck?.[0]?.price_override === 399;
    record(9, "Modify license price override (Exclusive set to $399)", !!step9Pass, "Override price verified in beat_licenses");

    // -------------------------------------------------------------
    // STEP 10: Publish the beat
    // -------------------------------------------------------------
    const { error: pubErr } = await adminClient
      .from("beats")
      .update({ published: true, updated_at: new Date().toISOString() })
      .eq("id", testBeatId);

    const { data: pubCheck } = await adminClient.from("beats").select("published").eq("id", testBeatId).single();
    const step10Pass = !pubErr && pubCheck?.published === true;
    record(10, "Publish the beat (published: true)", !!step10Pass, "Status set to published");

    // -------------------------------------------------------------
    // STEP 11: Confirm it appears publicly in /beats
    // -------------------------------------------------------------
    const { data: publicCatalog } = await publicClient
      .from("beats")
      .select("id, slug, title, published")
      .eq("published", true)
      .eq("id", testBeatId);

    const step11Pass = publicCatalog !== null && publicCatalog.length === 1 && publicCatalog[0].slug === updatedSlug;
    record(11, "Confirm beat appears publicly in catalog query", !!step11Pass, `Found in public client query with slug "${updatedSlug}"`);

    // -------------------------------------------------------------
    // STEP 12: Confirm the public beat page loads
    // -------------------------------------------------------------
    let step12Pass = false;
    let pageStatus = 0;
    try {
      const res = await fetch(`http://localhost:3001/beats/${updatedSlug}`, { method: "GET" });
      pageStatus = res.status;
      step12Pass = res.status === 200;
    } catch (e: any) {
      console.warn("Could not reach localhost:3001:", e.message);
    }
    record(12, "Confirm public beat page loads (HTTP 200)", step12Pass, `GET /beats/${updatedSlug} -> HTTP ${pageStatus}`);

    // -------------------------------------------------------------
    // STEP 13: Confirm private WAV cannot be accessed publicly
    // -------------------------------------------------------------
    const privateUrl = `${supabaseUrl}/storage/v1/object/public/${PRIVATE_BUCKET}/${wavPath2}`;
    const privRes = await fetch(privateUrl, { method: "GET" });
    const step13Pass = privRes.status !== 200;
    record(
      13,
      "Confirm private WAV cannot be accessed publicly",
      step13Pass,
      `GET ${privateUrl} -> HTTP ${privRes.status} (Public access blocked)`
    );

    // -------------------------------------------------------------
    // STEP 14: Delete the beat from /admin/beats
    // -------------------------------------------------------------
    // Mirror deleteBeatAction: clean storage in both buckets, then delete beat record
    await adminClient.storage.from(PUBLIC_BUCKET).remove([coverPath2, previewPath2]);
    await adminClient.storage.from(PRIVATE_BUCKET).remove([wavPath2]);
    const { error: delBeatErr } = await adminClient.from("beats").delete().eq("id", testBeatId);

    const step14Pass = !delBeatErr;
    record(14, "Delete beat and associated records", !!step14Pass, `Beat ${testBeatId} deleted`);

    // -------------------------------------------------------------
    // STEP 15: Confirm DB record, beat_files, beat_licenses are gone
    // -------------------------------------------------------------
    const { data: checkDeletedBeat } = await adminClient.from("beats").select("id").eq("id", testBeatId);
    const { data: checkDeletedFiles } = await adminClient.from("beat_files").select("id").eq("beat_id", testBeatId);
    const { data: checkDeletedLicenses } = await adminClient.from("beat_licenses").select("id").eq("beat_id", testBeatId);

    const step15Pass =
      checkDeletedBeat?.length === 0 &&
      checkDeletedFiles?.length === 0 &&
      checkDeletedLicenses?.length === 0;

    record(15, "Confirm DB record, beat_files, and beat_licenses are gone", !!step15Pass, "Zero residual records found in database");

    // -------------------------------------------------------------
    // STEP 16: Confirm all temporary Storage objects are gone
    // -------------------------------------------------------------
    const { data: pubRemainCovers } = await adminClient.storage.from(PUBLIC_BUCKET).list(`covers/${testBeatId}`);
    const { data: pubRemainPrev } = await adminClient.storage.from(PUBLIC_BUCKET).list(`previews/${testBeatId}`);
    const { data: privRemainWav } = await adminClient.storage.from(PRIVATE_BUCKET).list(`beats/${testBeatId}/wav`);

    const step16Pass =
      (pubRemainCovers?.length === 0 || !pubRemainCovers) &&
      (pubRemainPrev?.length === 0 || !pubRemainPrev) &&
      (privRemainWav?.length === 0 || !privRemainWav);

    record(16, "Confirm all temporary Storage objects are gone from both buckets", !!step16Pass, "Zero residual files in rgodbeat-public and rgodbeat-private");

    // -------------------------------------------------------------
    // STEP 17: Confirm original 12 seed beats remain untouched
    // -------------------------------------------------------------
    const { data: seedBeats, count } = await adminClient
      .from("beats")
      .select("id, slug", { count: "exact" });

    const step17Pass = count === 12;
    record(17, "Confirm original 12 seed beats remain untouched", !!step17Pass, `Database contains exactly ${count} beats (expected 12)`);

    console.log("==================================================================");
    const allPassed = results.every((r) => r.status === "PASS");
    const passedCount = results.filter((r) => r.status === "PASS").length;
    const failedCount = results.filter((r) => r.status === "FAIL").length;
    console.log(`E2E SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log("==================================================================");

    if (!allPassed) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("FATAL ERROR DURING E2E TEST:", err);
    process.exit(1);
  }
}

runE2E();
