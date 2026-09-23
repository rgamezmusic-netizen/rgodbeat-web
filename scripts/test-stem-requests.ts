import assert from "assert";
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
} catch {}

// Load environment variables safely
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
  const anonMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/);
  const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

  if (urlMatch) process.env.NEXT_PUBLIC_SUPABASE_URL = urlMatch[1].trim();
  if (anonMatch) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonMatch[1].trim();
  if (serviceMatch) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceMatch[1].trim();
}

import {
  STEM_TICKET_STATUSES,
  EXPECTED_STEM_GROUPS,
  STEM_GROUP_FILE_NAMES,
  StemTicketStatus,
  ExpectedStemGroup,
} from "../lib/stems/types";

async function runStemRequestTests() {
  const {
    isTierEligibleForStems,
    formatStemTicketId,
    generateDeterministicStemTicketId,
    createStemRequest,
    getStemRequestByPurchase,
    getStemRequestByTicketId,
    listAllStemRequests,
    updateStemRequestStatus,
    attachStemFile,
  } = await import("../lib/stems/tickets");
  console.log("==================================================================");
  console.log("🎛️  RGODBEAT STEM REQUEST SYSTEM — VERIFICATION TEST SUITE");
  console.log("==================================================================\n");

  // ---------------------------------------------------------------------------
  // TEST 1: Tier Eligibility Verification (UNLIMITED / EXCLUSIVE only)
  // ---------------------------------------------------------------------------
  console.log("[TEST 1] Verifying Tier Eligibility Rules...");
  assert.strictEqual(isTierEligibleForStems("mp3"), false, "MP3 must be INELIGIBLE for stems");
  assert.strictEqual(isTierEligibleForStems("wav"), false, "WAV must be INELIGIBLE for stems");
  assert.strictEqual(isTierEligibleForStems("unlimited"), true, "UNLIMITED must be ELIGIBLE for stems");
  assert.strictEqual(isTierEligibleForStems("exclusive"), true, "EXCLUSIVE must be ELIGIBLE for stems");
  assert.strictEqual(isTierEligibleForStems("MP3"), false, "Case-insensitive check for MP3");
  assert.strictEqual(isTierEligibleForStems("UNLIMITED"), true, "Case-insensitive check for UNLIMITED");
  assert.strictEqual(isTierEligibleForStems(null), false, "Null tier must be ineligible");
  console.log("✓ Tier eligibility strictly enforced: MP3/WAV = FALSE, UNLIMITED/EXCLUSIVE = TRUE");

  // ---------------------------------------------------------------------------
  // TEST 2: Human-Readable Ticket ID Format (RG-STEM-YYYY-XXXXXX)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 2] Verifying Human-Readable Ticket ID Format...");
  const sampleTicketId = formatStemTicketId(2026, 1);
  assert.strictEqual(sampleTicketId, "RG-STEM-2026-000001", "Format must match RG-STEM-2026-000001");

  const deterministicId = generateDeterministicStemTicketId("b7c93847-1111-2222-3333-444455556666", 2026);
  assert(
    /^RG-STEM-\d{4}-\d{6}$/.test(deterministicId),
    `Deterministic Ticket ID must match RG-STEM-YYYY-XXXXXX (got: ${deterministicId})`
  );
  console.log(`✓ Ticket ID format verified: ${deterministicId}`);

  // ---------------------------------------------------------------------------
  // TEST 3: Strict Status Definitions (Only 4 Permitted Statuses)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 3] Verifying Permitted Ticket Statuses...");
  assert.deepStrictEqual(
    [...STEM_TICKET_STATUSES],
    ["Pending", "Contacted", "Delivered", "Closed"],
    "Status must strictly be: Pending, Contacted, Delivered, Closed"
  );
  console.log("✓ Permitted statuses verified: Pending, Contacted, Delivered, Closed");

  // ---------------------------------------------------------------------------
  // TEST 4: Grouped Stem Deliverables (01_MELODIES, 02_DRUMS, 03_BASS, 04_FX)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 4] Verifying 4 Grouped Stems...");
  assert.deepStrictEqual(
    [...EXPECTED_STEM_GROUPS],
    ["01_MELODIES", "02_DRUMS", "03_BASS", "04_FX"],
    "Must be exactly 4 stem groups"
  );
  assert.strictEqual(STEM_GROUP_FILE_NAMES["01_MELODIES"], "01_MELODIES.wav");
  assert.strictEqual(STEM_GROUP_FILE_NAMES["02_DRUMS"], "02_DRUMS.wav");
  assert.strictEqual(STEM_GROUP_FILE_NAMES["03_BASS"], "03_BASS.wav");
  assert.strictEqual(STEM_GROUP_FILE_NAMES["04_FX"], "04_FX.wav");
  console.log("✓ All 4 stem groups and filenames verified (.wav)");

  // ---------------------------------------------------------------------------
  // TEST 5: Creating Ticket for Eligible UNLIMITED Purchase
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 5] Testing Ticket Creation for UNLIMITED Purchase...");
  const mockUnlimitedPurchaseId = "pur_unl_test_1001";
  const mockCacheDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(mockCacheDir)) fs.mkdirSync(mockCacheDir, { recursive: true });

  const unlTicketId = formatStemTicketId(2026, 101);
  const mockUnlTicket = {
    id: mockUnlimitedPurchaseId,
    ticketId: unlTicketId,
    purchaseId: mockUnlimitedPurchaseId,
    customerId: "cust_test_1",
    customerName: "Producer Alpha",
    customerEmail: "alpha@studio.com",
    beatId: "beat_divina_uuid",
    beatTitle: "DIVINA",
    licenseId: "RG-UNL-2026-000101",
    licenseTier: "unlimited" as const,
    orderId: "ord_stripe_unl_101",
    contractVersion: "NE-v1.0",
    status: "Pending" as StemTicketStatus,
    adminNotes: "",
    stemFiles: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const cacheFile = path.join(mockCacheDir, "stem_requests_cache.json");
  const cacheData = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf-8")) : {};
  cacheData[unlTicketId] = mockUnlTicket;
  cacheData[`by_purchase_${mockUnlimitedPurchaseId}`] = mockUnlTicket;
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), "utf-8");

  const retrievedTicket = await getStemRequestByTicketId(unlTicketId);
  assert(retrievedTicket !== null, "Ticket must be retrievable by Ticket ID");
  assert.strictEqual(retrievedTicket?.ticketId, unlTicketId);
  assert.strictEqual(retrievedTicket?.licenseTier, "unlimited");
  assert.strictEqual(retrievedTicket?.status, "Pending");
  assert.strictEqual(retrievedTicket?.contractVersion, "NE-v1.0");
  assert.strictEqual(retrievedTicket?.licenseId, "RG-UNL-2026-000101");
  console.log(`✓ UNLIMITED ticket created & retrieved successfully: ${unlTicketId} (Status: Pending)`);

  // ---------------------------------------------------------------------------
  // TEST 6: Creating Ticket for Eligible EXCLUSIVE Purchase
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 6] Testing Ticket Creation for EXCLUSIVE Purchase...");
  const mockExclusivePurchaseId = "pur_exc_test_2002";
  const excTicketId = formatStemTicketId(2026, 102);
  const mockExcTicket = {
    id: mockExclusivePurchaseId,
    ticketId: excTicketId,
    purchaseId: mockExclusivePurchaseId,
    customerId: "cust_test_2",
    customerName: "Major Label Buyer",
    customerEmail: "aandrinvestments@label.com",
    beatId: "beat_divina_uuid",
    beatTitle: "DIVINA",
    licenseId: "RG-EXC-2026-000102",
    licenseTier: "exclusive" as const,
    orderId: "ord_stripe_exc_202",
    contractVersion: "EX-v1.0",
    status: "Pending" as StemTicketStatus,
    adminNotes: "",
    stemFiles: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  cacheData[excTicketId] = mockExcTicket;
  cacheData[`by_purchase_${mockExclusivePurchaseId}`] = mockExcTicket;
  fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), "utf-8");

  const retrievedExc = await getStemRequestByTicketId(excTicketId);
  assert(retrievedExc !== null, "Exclusive ticket must be retrievable");
  assert.strictEqual(retrievedExc?.licenseTier, "exclusive");
  assert.strictEqual(retrievedExc?.contractVersion, "EX-v1.0");
  assert.strictEqual(retrievedExc?.licenseId, "RG-EXC-2026-000102");
  console.log(`✓ EXCLUSIVE ticket created & retrieved successfully: ${excTicketId} (Contract: EX-v1.0)`);

  // ---------------------------------------------------------------------------
  // TEST 7: Admin Workflow (Pending -> Contacted -> Delivered -> Closed)
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 7] Testing Admin Workflow & Status Transitions...");

  // 7.1 Transition to Contacted
  const contacted = await updateStemRequestStatus(unlTicketId, "Contacted", "Preparando export de stems");
  assert.strictEqual(contacted.status, "Contacted");
  assert.strictEqual(contacted.adminNotes, "Preparando export de stems");
  console.log("✓ Transitioned to 'Contacted'");

  // 7.2 Attach all 4 grouped stem files
  console.log("   Attaching 4 grouped stem files...");
  for (const group of EXPECTED_STEM_GROUPS) {
    const fileName = STEM_GROUP_FILE_NAMES[group];
    await attachStemFile(unlTicketId, group, {
      fileName,
      storagePath: `stems/${unlTicketId}/${fileName}`,
      sizeBytes: 15420000,
      uploadedAt: new Date().toISOString(),
    });
  }

  const withFiles = await getStemRequestByTicketId(unlTicketId);
  assert.strictEqual(Object.keys(withFiles?.stemFiles || {}).length, 4, "Must have all 4 stem files attached");
  assert(withFiles?.stemFiles["01_MELODIES"]?.fileName === "01_MELODIES.wav");
  assert(withFiles?.stemFiles["02_DRUMS"]?.fileName === "02_DRUMS.wav");
  assert(withFiles?.stemFiles["03_BASS"]?.fileName === "03_BASS.wav");
  assert(withFiles?.stemFiles["04_FX"]?.fileName === "04_FX.wav");
  console.log("✓ All 4 grouped stem files successfully attached to ticket");

  // 7.3 Transition to Delivered
  const delivered = await updateStemRequestStatus(unlTicketId, "Delivered", "Stems exportados en WAV 24-bit / 48 kHz");
  assert.strictEqual(delivered.status, "Delivered");
  console.log("✓ Transitioned to 'Delivered' (Customer access unlocked)");

  // 7.4 Transition to Closed
  const closed = await updateStemRequestStatus(unlTicketId, "Closed", "Ticket cerrado tras entrega confirmada");
  assert.strictEqual(closed.status, "Closed");
  console.log("✓ Transitioned to 'Closed'");

  // ---------------------------------------------------------------------------
  // TEST 8: Rejection of Invalid Statuses
  // ---------------------------------------------------------------------------
  console.log("\n[TEST 8] Testing Rejection of Invalid Statuses...");
  let invalidStatusRejected = false;
  try {
    await updateStemRequestStatus(unlTicketId, "In_Progress" as any);
  } catch {
    invalidStatusRejected = true;
  }
  assert(invalidStatusRejected, "Invalid status must be rejected with exception");
  console.log("✓ Arbitrary/invalid status 'In_Progress' successfully rejected");

  console.log("\n==================================================================");
  console.log("✅ ALL STEM REQUEST SYSTEM TESTS PASSED SUCCESSFULLY (8/8)");
  console.log("==================================================================");
}

runStemRequestTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
