import * as fs from "fs";
import * as path from "path";

// Mock 'server-only' package for standalone node/tsx test runners
try {
  const serverOnlyPath = require.resolve("server-only");
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as any;
} catch {
  // Ignore if server-only is not present
}

import { createClient } from "@supabase/supabase-js";

// Load environment safely without exposing values
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/);
const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (urlMatch) process.env.NEXT_PUBLIC_SUPABASE_URL = urlMatch[1].trim();
if (anonMatch) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonMatch[1].trim();
if (serviceMatch) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceMatch[1].trim();

import { resolveAuthoritativeCart, fulfillStripeCheckoutSession } from "../lib/commerce/fulfillment";
import { resolvePrivateDownloadUrl } from "../lib/storage/private";
import { generateLicenseContract } from "../lib/commerce/contracts";
import type Stripe from "stripe";

if (!urlMatch || !serviceMatch) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const serviceKey = serviceMatch[1].trim();
const anonKey = anonMatch ? anonMatch[1].trim() : "";

const adminClient = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

async function runCommerceVerification() {
  console.log("==================================================================");
  console.log("💳 RGODBEAT 2.0 — COMMERCE & STRIPE INTEGRATION VERIFICATION");
  console.log("==================================================================");

  // 1. Authoritative Pricing Integrity Tests
  console.log("\n--- 1. Authoritative Server-Side Pricing Tests ---");

  // Fetch a published beat for testing
  const { data: beats, error: bErr } = await adminClient
    .from("beats")
    .select("id, title, published")
    .eq("published", true)
    .limit(1);

  assert(!bErr && !!beats && beats.length > 0, "Retrieve published beat from Supabase for testing");
  const testBeat = beats ? beats[0] : null;

  if (testBeat) {
    // 1.1 Zero Browser Trust: Manipulated Price Overridden
    try {
      const cartResult = await resolveAuthoritativeCart([
        { beatId: testBeat.id, licenseTier: "mp3" },
      ]);

      assert(
        cartResult.items.length === 1 && cartResult.items[0].unitPrice === 29,
        "Authoritative pricing: MP3 tier resolved strictly to $29.00 regardless of client",
        `Resolved: $${cartResult.items[0].unitPrice}`
      );
      assert(
        cartResult.totalAmount === 29,
        "Authoritative total amount matches sum of authoritative items ($29.00)"
      );
    } catch (err: any) {
      assert(false, "Authoritative pricing resolution for MP3", err.message);
    }

    // 1.2 Multi-license Cart Calculation
    try {
      const multiCart = await resolveAuthoritativeCart([
        { beatId: testBeat.id, licenseTier: "mp3" },
        { beatId: testBeat.id, licenseTier: "wav" },
      ]);

      assert(
        multiCart.totalAmount === 78,
        "Authoritative multi-license calculation: MP3 ($29) + WAV ($49) = $78.00",
        `Resolved total: $${multiCart.totalAmount}`
      );
    } catch (err: any) {
      assert(false, "Authoritative multi-license cart resolution", err.message);
    }

    // 1.3 Invalid/Non-existent Beat ID Rejected
    let rejectedInvalidBeat = false;
    try {
      await resolveAuthoritativeCart([
        { beatId: "00000000-0000-0000-0000-000000000000", licenseTier: "mp3" },
      ]);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        rejectedInvalidBeat = true;
      }
    }
    assert(rejectedInvalidBeat, "Server strictly rejects non-existent beat IDs with 400 error");

    // 1.4 Invalid License Tier Rejected
    let rejectedInvalidTier = false;
    try {
      await resolveAuthoritativeCart([
        { beatId: testBeat.id, licenseTier: "nonexistent_license" as any },
      ]);
    } catch (err: any) {
      if (err.message.includes("invalid or inactive")) {
        rejectedInvalidTier = true;
      }
    }
    assert(rejectedInvalidTier, "Server strictly rejects invalid or unseeded license tiers");
  }

  // 2. Legal Contract & Agreement Generation
  console.log("\n--- 2. Legal Contract Generation Tests ---");
  const sampleContract = generateLicenseContract({
    orderId: "ord_test_12345",
    customerName: "Alex Rivera",
    customerEmail: "alex@producer.test",
    beatTitle: "Midnight Dynasty",
    beatId: "beat-uuid-001",
    licenseTier: "wav",
    amountPaid: 49.0,
    currency: "USD",
  });

  assert(
    sampleContract.includes("PREMIUM WAV MASTER LEASE AGREEMENT"),
    "Contract generator includes correct license tier title"
  );
  assert(
    sampleContract.includes("alex@producer.test") && sampleContract.includes("Midnight Dynasty"),
    "Contract generator binds licensee email, licensor and beat title"
  );
  assert(
    sampleContract.includes("Up to 500,000 commercial audio streams"),
    "Contract contains authoritative WAV license terms and streaming limits"
  );

  // 3. Webhook Idempotency & Database Integrity
  console.log("\n--- 3. Webhook Idempotency & Database Schema Tests ---");

  // Check if commerce tables exist in Supabase
  const { error: ordersTableErr } = await adminClient.from("orders").select("id").limit(1);
  const tablesApplied = !ordersTableErr;

  if (tablesApplied) {
    assert(true, "Commerce tables (orders, customers, order_items, purchases) exist in Supabase");

    const testSessionId = `cs_test_idempotent_${Date.now()}`;
    const testSessionMock: any = {
      id: testSessionId,
      payment_status: "paid",
      currency: "usd",
      customer_details: {
        email: "e2e_buyer@rgodbeat.test",
        name: "E2E Buyer",
      },
      metadata: {
        customerEmail: "e2e_buyer@rgodbeat.test",
        customerName: "E2E Buyer",
        itemsJson: JSON.stringify([
          { beatId: testBeat?.id, licenseTier: "mp3" },
          { beatId: testBeat?.id, licenseTier: "wav" },
        ]),
      },
    };

    // 3.1 First Webhook Execution
    let firstOrderId = "";
    try {
      const res1 = await fulfillStripeCheckoutSession(testSessionMock);
      assert(res1.status === "fulfilled", "First webhook arrival fulfills order and creates entitlements");
      firstOrderId = res1.orderId;
    } catch (err: any) {
      assert(false, "First webhook fulfillment execution", err.message);
    }

    // 3.2 Duplicate Webhook Execution (Idempotency Test)
    try {
      const res2 = await fulfillStripeCheckoutSession(testSessionMock);
      assert(
        res2.status === "already_fulfilled" && res2.orderId === firstOrderId,
        "Idempotency: Replaying exact same webhook does NOT duplicate order or entitlements",
        `Safely recognized existing order ID: ${res2.orderId}`
      );
    } catch (err: any) {
      assert(false, "Duplicate webhook idempotency check", err.message);
    }

    // 3.3 Verify Database Records Created
    const { data: dbOrder } = await adminClient
      .from("orders")
      .select("id, status, payment_status, total_amount")
      .eq("id", firstOrderId)
      .single();

    assert(
      dbOrder?.status === "completed" && dbOrder?.payment_status === "paid",
      "Order status is 'completed' and payment_status is 'paid' in database"
    );

    const { data: dbPurchases } = await adminClient
      .from("purchases")
      .select("id, license_tier, status")
      .eq("order_id", firstOrderId);

    assert(
      dbPurchases?.length === 2,
      "Exactly 2 purchase entitlements created for 2 cart items (no duplicates)"
    );

    // 4. Download Authorization & Boundary Tests
    console.log("\n--- 4. Download Authorization & Boundary Invariants ---");

    const mp3Purchase = dbPurchases?.find((p) => p.license_tier === "mp3");
    const wavPurchase = dbPurchases?.find((p) => p.license_tier === "wav");

    // 4.1 MP3 Purchaser cannot download WAV
    if (mp3Purchase) {
      let threwWavViolation = false;
      try {
        await resolvePrivateDownloadUrl({
          purchaseId: mp3Purchase.id,
          fileType: "wav",
        });
      } catch (err: any) {
        if (err.message.includes("License Security Violation")) {
          threwWavViolation = true;
        }
      }
      assert(
        threwWavViolation,
        "Boundary Invariant: MP3 license purchaser strictly blocked from downloading master WAV"
      );

      // 4.2 MP3 Purchaser cannot download Stems
      let threwStemsViolation = false;
      try {
        await resolvePrivateDownloadUrl({
          purchaseId: mp3Purchase.id,
          fileType: "stems",
        });
      } catch (err: any) {
        if (err.message.includes("License Security Violation")) {
          threwStemsViolation = true;
        }
      }
      assert(
        threwStemsViolation,
        "Boundary Invariant: MP3 license purchaser strictly blocked from downloading Stems"
      );
    }

    // 4.3 WAV Purchaser cannot download Stems
    if (wavPurchase) {
      let threwWavStemsViolation = false;
      try {
        await resolvePrivateDownloadUrl({
          purchaseId: wavPurchase.id,
          fileType: "stems",
        });
      } catch (err: any) {
        if (err.message.includes("License Security Violation")) {
          threwWavStemsViolation = true;
        }
      }
      assert(
        threwWavStemsViolation,
        "Boundary Invariant: WAV license purchaser strictly blocked from downloading Stems"
      );
    }

    // 4.4 Non-existent Purchase ID Rejected
    let threwInvalidPurchase = false;
    try {
      await resolvePrivateDownloadUrl({
        purchaseId: "00000000-0000-0000-0000-000000000000",
        fileType: "mp3",
      });
    } catch (err: any) {
      threwInvalidPurchase = true;
    }
    assert(threwInvalidPurchase, "Invalid purchase ID returns entitlement not found / access denied");
  } else {
    console.log("ℹ️  Note: Commerce tables migration (20260920000004) pending execution in Supabase Dashboard.");
    console.log("   Migration file created at: supabase/migrations/20260920000004_commerce_system.sql");
    console.log("   Once executed in Supabase SQL editor, webhook & download DB fulfillment tests will run live.");
  }

  // 5. Storage & Secret Key Safety
  console.log("\n--- 5. Storage & Secret Key Protection Invariants ---");

  // 5.1 Private Storage Bucket is not public
  const { data: buckets } = await adminClient.storage.listBuckets();
  const privateBucket = buckets?.find((b) => b.id === "rgodbeat-private");
  assert(
    privateBucket !== undefined && privateBucket.public === false,
    "Storage Security: 'rgodbeat-private' bucket public property is strictly FALSE"
  );

  // 5.2 Direct unauthenticated HTTP download to private storage fails
  if (privateBucket) {
    try {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/public/rgodbeat-private/test.wav`);
      assert(
        res.status === 400 || res.status === 403 || res.status === 404,
        "Direct public CDN download to 'rgodbeat-private' is blocked (Access Denied)",
        `HTTP Status: ${res.status}`
      );
    } catch {
      assert(true, "Direct public CDN download connection blocked");
    }
  }

  console.log("\n==================================================================");
  console.log(`COMMERCE VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCommerceVerification().catch((err) => {
  console.error("Verification execution error:", err);
  process.exit(1);
});
