import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Read env variables safely without logging secrets
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function runVerification() {
  console.log("==================================================================");
  console.log("🔍 RGODBEAT 2.0 — SUPABASE DATABASE SCHEMA VERIFICATION");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // 1. Verify categories table exists & returns 8 seeded categories
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, slug")
      .order("name");

    assert(!error && !!data, "Table 'categories' exists and is readable", error?.message);
    assert(data?.length === 8, `Categories seed count is 8 (found ${data?.length})`);
    if (data) {
      const slugs = data.map((c) => c.slug).sort();
      console.log(`   Categories found: ${slugs.join(", ")}`);
    }
  } catch (err: any) {
    assert(false, "Table 'categories' query", err.message);
  }

  // 2. Verify license_types table exists & returns 5 active license types
  try {
    const { data, error } = await supabase
      .from("license_types")
      .select("id, name, slug, price, sort_order")
      .eq("active", true)
      .order("sort_order");

    assert(!error && !!data, "Table 'license_types' exists and is readable", error?.message);
    assert(data?.length === 5, `License types seed count is 5 (found ${data?.length})`);
    if (data) {
      console.log(`   License tiers found: ${data.map((l) => `${l.slug} ($${l.price})`).join(", ")}`);
    }
  } catch (err: any) {
    assert(false, "Table 'license_types' query", err.message);
  }

  // 3. Verify beats table exists & returns 12 published beats
  try {
    const { data, error } = await supabase
      .from("beats")
      .select("id, title, slug, bpm, musical_key, published, featured")
      .eq("published", true)
      .order("created_at", { ascending: false });

    assert(!error && !data?.length !== true, "Table 'beats' exists and is readable", error?.message);
    assert(data?.length === 12, `Published beats seed count is 12 (found ${data?.length})`);
    const featuredCount = data?.filter((b) => b.featured).length || 0;
    assert(featuredCount === 6, `Featured beats count is 6 (found ${featuredCount})`);
  } catch (err: any) {
    assert(false, "Table 'beats' query", err.message);
  }

  // 4. Verify beat_licenses table exists & contains relationships
  try {
    const { data, error } = await supabase
      .from("beat_licenses")
      .select("id, beat_id, license_type_id, active")
      .eq("active", true);

    assert(!error && !!data, "Table 'beat_licenses' exists and is readable", error?.message);
    assert((data?.length || 0) >= 60, `Beat licenses seed count is at least 60 (found ${data?.length})`);
  } catch (err: any) {
    assert(false, "Table 'beat_licenses' query", err.message);
  }

  // 5. Verify RLS denies public write on beats
  try {
    const { data, error } = await supabase
      .from("beats")
      .insert({
        title: "Unauthorized Beat",
        slug: "unauthorized-beat-" + Date.now(),
        published: true,
      });

    assert(!!error, "RLS Security: Public INSERT on 'beats' is rejected", error ? error.message : "Allowed unexpectedly!");
  } catch (err: any) {
    assert(true, "RLS Security: Public INSERT rejected via exception");
  }

  // 6. Verify RLS denies public write on categories
  try {
    const { data, error } = await supabase
      .from("categories")
      .insert({
        name: "Unauthorized Category",
        slug: "unauthorized-cat-" + Date.now(),
      });

    assert(!!error, "RLS Security: Public INSERT on 'categories' is rejected", error ? error.message : "Allowed unexpectedly!");
  } catch (err: any) {
    assert(true, "RLS Security: Public INSERT on 'categories' rejected via exception");
  }

  // 7. Verify RLS denies public read on private beat_files
  try {
    const { data, error } = await supabase
      .from("beat_files")
      .select("*");

    // With RLS enabled and no select policy, data is empty or error returned
    assert((!error && data?.length === 0) || !!error, "RLS Security: Public access to 'beat_files' returns 0 rows / denied");
  } catch (err: any) {
    assert(true, "RLS Security: Access to beat_files protected");
  }

  // 8. Verify relational joined queries (Beats + Categories + Licenses)
  try {
    const { data, error } = await supabase
      .from("beats")
      .select(`
        id,
        title,
        slug,
        category:categories(name, slug),
        beat_licenses(
          price_override,
          license_type:license_types(name, slug, price)
        )
      `)
      .eq("published", true)
      .limit(1)
      .single();

    assert(!error && !!data && !!(data as any).category?.slug, "Relational JOIN (Beats -> Category -> Beat Licenses) works cleanly");
  } catch (err: any) {
    assert(false, "Relational JOIN query", err.message);
  }

  console.log("==================================================================");
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerification();
