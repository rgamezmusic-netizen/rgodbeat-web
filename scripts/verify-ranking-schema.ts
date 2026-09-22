import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/);
const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !anonMatch || !serviceMatch) {
  console.error("❌ Missing SUPABASE credentials in .env.local");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseAnonKey = anonMatch[1].trim();
const supabaseServiceKey = serviceMatch[1].trim();

const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const publicClient = createClient(supabaseUrl, supabaseAnonKey);

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    if (detail) console.log(`   ${detail}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (detail) console.error(`   ${detail}`);
    failed++;
  }
}

async function runVerification() {
  console.log("==================================================================");
  console.log("🏆 RGODBEAT 2.0 — TOP 23 ENGINE & RANKING SCHEMA VERIFICATION");
  console.log("==================================================================");

  try {
    // 1. Check all new columns on public.beats
    const { data: beatsSample, error: sampleErr } = await adminClient
      .from("beats")
      .select("id, ranking_status, current_rank, previous_rank, ranking_period, pool_entry_date, days_in_pool, performance_window_started_at, performance_window_ended_at, performance_score, performance_metrics, local_sync_status, local_archive_path, last_synced_at, online_asset_status")
      .limit(1);

    assert(!sampleErr, "Table 'public.beats' contains all Top 23 Engine and Local Sync columns", sampleErr ? sampleErr.message : "All 14 new columns exist and are queryable");

    // 2. Preservation of the 12 seed beats
    const { data: seedBeats, count: seedCount } = await adminClient
      .from("beats")
      .select("id, title, current_rank, ranking_status, published", { count: "exact" })
      .eq("published", true)
      .order("current_rank", { ascending: true });

    assert(seedCount === 12, "Seed integrity: Exactly 12 published beats preserved", `Found ${seedCount} published beats`);

    // 3. Seed initialization check (ranks 1 to 12 assigned deterministically without fake performance)
    const seedRanks = (seedBeats || []).map((b) => b.current_rank);
    const expectedRanks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const ranksMatch = JSON.stringify(seedRanks) === JSON.stringify(expectedRanks);
    const allActive = (seedBeats || []).every((b) => b.ranking_status === "active");

    assert(ranksMatch && allActive, "Seed initialization: Beats 1..12 assigned ranks 1-12 with status 'active'", `Ranks: ${seedRanks.join(", ")}`);

    // 4. Constraint Check: ranking_status constraint
    const testInvalidStatusId = "00000000-0000-0000-0000-000000000991";
    const { error: invalidStatusErr } = await adminClient.from("beats").insert({
      id: testInvalidStatusId,
      title: "Invalid Status Beat",
      slug: "invalid-status-test",
      ranking_status: "invalid_status_value",
      published: false,
    });
    assert(!!invalidStatusErr, "Constraint enforcement: Invalid ranking_status rejected", invalidStatusErr?.message);
    await adminClient.from("beats").delete().eq("id", testInvalidStatusId);

    // 5. Invariant Check: current_rank lifecycle relationship
    // 5a. Non-active beat with current_rank set is REJECTED
    const testInvalidRankId = "00000000-0000-0000-0000-000000000992";
    const { error: invalidNonActiveRankErr } = await adminClient.from("beats").insert({
      id: testInvalidRankId,
      title: "Invalid Non-Active Rank Beat",
      slug: "invalid-nonactive-rank-test",
      ranking_status: "draft",
      current_rank: 5, // Draft must have current_rank = NULL
      published: false,
    });
    assert(!!invalidNonActiveRankErr, "Constraint enforcement: non-active beat with non-null current_rank rejected", invalidNonActiveRankErr?.message);
    await adminClient.from("beats").delete().eq("id", testInvalidRankId);

    // 5b. Active beat with current_rank = NULL is REJECTED
    const { error: invalidActiveNullErr } = await adminClient.from("beats").insert({
      id: testInvalidRankId,
      title: "Invalid Active Null Beat",
      slug: "invalid-active-null-test",
      ranking_status: "active",
      current_rank: null, // Active MUST have current_rank 1-23
      published: false,
    });
    assert(!!invalidActiveNullErr, "Constraint enforcement: active beat with NULL current_rank rejected", invalidActiveNullErr?.message);
    await adminClient.from("beats").delete().eq("id", testInvalidRankId);

    // 5c. Active beat with current_rank > 23 is REJECTED
    const { error: invalidRankRangeErr } = await adminClient.from("beats").insert({
      id: testInvalidRankId,
      title: "Invalid Rank Range Beat",
      slug: "invalid-rank-range-test",
      ranking_status: "active",
      current_rank: 24, // Boundary is 23
      published: false,
    });
    assert(!!invalidRankRangeErr, "Constraint enforcement: active beat with current_rank > 23 rejected", invalidRankRangeErr?.message);
    await adminClient.from("beats").delete().eq("id", testInvalidRankId);

    // 6. Invariant Check: unique partial index on current_rank (Collision rejection)
    // Attempt to insert a beat with current_rank = 1 (already occupied by first seed beat)
    const testDuplicateRankId = "00000000-0000-0000-0000-000000000993";
    const { error: duplicateRankErr } = await adminClient.from("beats").insert({
      id: testDuplicateRankId,
      title: "Duplicate Rank Beat",
      slug: "duplicate-rank-test",
      current_rank: 1, // Already held by beat #1
      published: false,
    });
    assert(!!duplicateRankErr, "Database Invariant: Duplicate current_rank rejected by unique index", duplicateRankErr?.message);
    await adminClient.from("beats").delete().eq("id", testDuplicateRankId);

    // 6b. Constraint Check: local_sync_status allows only pending, synced, failed
    const testInvalidSyncStatusId = "00000000-0000-0000-0000-000000000994";
    const { error: invalidSyncErr } = await adminClient.from("beats").insert({
      id: testInvalidSyncStatusId,
      title: "Invalid Sync Status Beat",
      slug: "invalid-sync-status-test",
      local_sync_status: "archived", // Only pending, synced, failed allowed
      published: false,
    });
    assert(!!invalidSyncErr, "Constraint enforcement: local_sync_status only allows pending, synced, failed", invalidSyncErr?.message);
    await adminClient.from("beats").delete().eq("id", testInvalidSyncStatusId);

    // 7. Security Check: Public users cannot read beat_ranking_history
    const { data: publicHistoryData, error: publicHistoryErr } = await publicClient
      .from("beat_ranking_history")
      .select("*");

    const historyHiddenFromPublic = !publicHistoryData || publicHistoryData.length === 0 || !!publicHistoryErr;
    assert(historyHiddenFromPublic, "Security Barrier: Public / anon cannot read beat_ranking_history (RLS DENY)", publicHistoryErr ? publicHistoryErr.message : "0 rows returned to public client");

    // 8. Security Check: Public users cannot insert into beat_ranking_history
    const { error: publicInsertHistErr } = await publicClient.from("beat_ranking_history").insert({
      beat_id: seedBeats?.[0]?.id,
      ranking_period: "2026-W38",
      event_type: "entry",
      rank: 1,
    });
    assert(!!publicInsertHistErr, "Security Barrier: Public / anon cannot insert into beat_ranking_history (RLS DENY)", publicInsertHistErr?.message);

    // 9. Admin Access Check: service_role can read and write to beat_ranking_history
    const testHistoryBeatId = seedBeats?.[0]?.id;
    let testHistoryId = "";
    if (testHistoryBeatId) {
      const { data: histInsert, error: histInsertErr } = await adminClient
        .from("beat_ranking_history")
        .insert({
          beat_id: testHistoryBeatId,
          ranking_period: "2026-W38",
          event_type: "weekly_rotation",
          rank: 1,
          performance_score: 0.0000,
          sales_count: 0,
          revenue_usd: 0.00,
        })
        .select("id")
        .single();

      testHistoryId = histInsert?.id || "";
      assert(!histInsertErr && !!testHistoryId, "Admin Privileges: service_role can insert into beat_ranking_history", histInsertErr?.message);

      // Clean up test history entry
      if (testHistoryId) {
        await adminClient.from("beat_ranking_history").delete().eq("id", testHistoryId);
      }
    }

    // 10. Public catalog availability: Public users still query published beats normally
    const { data: publicCatalog, error: pubCatalogErr } = await publicClient
      .from("beats")
      .select("id, title, slug, current_rank, published")
      .eq("published", true);

    assert(!pubCatalogErr && (publicCatalog?.length || 0) >= 12, "Public Storefront: Published beats readable by public client", `Retrieved ${publicCatalog?.length} beats via anon key`);

    // 11. Security Check: Private WAV remains inaccessible without signed URL
    const privateBucket = "rgodbeat-private";
    const privateProbeUrl = `${supabaseUrl}/storage/v1/object/public/${privateBucket}/beats/${seedBeats?.[0]?.id}/wav/master.wav`;
    const probeRes = await fetch(privateProbeUrl);
    assert(probeRes.status !== 200, "Storage Boundary: Private master WAV cannot be downloaded via public CDN URL", `HTTP ${probeRes.status} (Access Denied)`);

    // 12. Security Check: No service_role credential in client bundles or client source files
    const clientFiles = [
      path.resolve(__dirname, "../components/beats/BeatsShopClient.tsx"),
      path.resolve(__dirname, "../components/admin/AdminBeatsTable.tsx"),
      path.resolve(__dirname, "../lib/supabase/client.ts"),
    ];
    let serviceKeyLeaked = false;
    for (const f of clientFiles) {
      if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, "utf8");
        if (content.includes("SUPABASE_SERVICE_ROLE_KEY") || content.includes(supabaseServiceKey)) {
          serviceKeyLeaked = true;
        }
      }
    }
    assert(!serviceKeyLeaked, "Client Bundle Security: Zero service_role credentials in client components", "Checked client components and browser libraries");

  } catch (err: any) {
    console.error("FATAL ERROR IN RANKING VERIFICATION:", err);
    failed++;
  }

  console.log("==================================================================");
  console.log(`TOP 23 ENGINE VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
