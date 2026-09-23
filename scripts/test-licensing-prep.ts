import assert from "assert";
import { LICENSE_OPTIONS } from "@/lib/mock-data";
import {
  CONTRACT_VERSIONS,
  TIER_CONTRACT_CONFIGS,
  formatLicenseId,
  generateDeterministicLicenseId,
  generateLicenseContract,
  generateContractPdfBuffer,
  extractLicenseMetadata,
} from "@/lib/commerce/contracts";

async function runComprehensiveTests() {
  console.log("=== RGODBEAT UNIFIED NON-EXCLUSIVE CONTRACT & LICENSE ID SYSTEM TESTS ===\n");

  // 1. Verify License ID Prefixes & Format
  console.log("[TEST 1] Verifying Official License ID Prefixes and Human-Readable Format...");
  const sampleYear = 2026;
  const sampleSeq = 1;

  const mp3Id = formatLicenseId("mp3", sampleYear, sampleSeq);
  assert.strictEqual(mp3Id, "RG-MP3-2026-000001", "MP3 License ID must match RG-MP3-2026-000001");

  const wavId = formatLicenseId("wav", sampleYear, 2);
  assert.strictEqual(wavId, "RG-WAV-2026-000002", "WAV License ID must match RG-WAV-2026-000002");

  const unlId = formatLicenseId("unlimited", sampleYear, 3);
  assert.strictEqual(unlId, "RG-UNL-2026-000003", "UNLIMITED License ID must match RG-UNL-2026-000003");

  const excId = formatLicenseId("exclusive", sampleYear, 4);
  assert.strictEqual(excId, "RG-EXC-2026-000004", "EXCLUSIVE License ID must match RG-EXC-2026-000004");
  console.log("✓ License IDs format verified: MP3, WAV, UNLIMITED, EXCLUSIVE");

  // 2. Verify Contract Versions
  console.log("\n[TEST 2] Verifying Contract Versions...");
  assert.strictEqual(CONTRACT_VERSIONS.NON_EXCLUSIVE, "NE-v1.0");
  assert.strictEqual(CONTRACT_VERSIONS.EXCLUSIVE, "EX-v1.0");
  console.log("✓ Versions verified: NON_EXCLUSIVE = NE-v1.0, EXCLUSIVE = EX-v1.0");

  // 3. Verify Exact Deliverables per Tier
  console.log("\n[TEST 3] Verifying Deliverables mapping...");
  assert.strictEqual(TIER_CONTRACT_CONFIGS.mp3.deliverables, "MP3 320 kbps");
  assert.strictEqual(TIER_CONTRACT_CONFIGS.wav.deliverables, "MP3 320 kbps + WAV 24-bit / 48 kHz");
  assert.strictEqual(
    TIER_CONTRACT_CONFIGS.unlimited.deliverables,
    "MP3 + WAV + grouped stems available upon request"
  );
  assert.strictEqual(
    TIER_CONTRACT_CONFIGS.exclusive.deliverables,
    "MP3 + WAV + grouped stems available upon request"
  );
  console.log("✓ Deliverables verified for all tiers");

  // 4. Verify Single Master Template dynamic variable injection
  console.log("\n[TEST 4] Verifying Dynamic Variable Injection into Master Template...");
  const orderId = "ord_test_999";
  const customerName = "Rafael Gamez";
  const customerEmail = "rgodbeat@gmail.com";
  const beatTitle = "DIVINA";
  const beatId = "a4c1b253-0fc4-42c4-9f17-b96e03115b23";
  const licenseId = "RG-WAV-2026-000042";

  const contractText = generateLicenseContract({
    orderId,
    customerName,
    customerEmail,
    beatTitle,
    beatId,
    licenseTier: "wav",
    amountPaid: 49,
    currency: "USD",
    purchaseDate: "2026-09-23T12:00:00Z",
    licenseId,
    version: CONTRACT_VERSIONS.NON_EXCLUSIVE,
  });

  // Verify all 11 dynamic variables are substituted and no {{...}} remain
  assert(contractText.includes(licenseId), "Must contain {{LICENSE_ID}}");
  assert(contractText.includes(orderId), "Must contain {{ORDER_ID}}");
  assert(contractText.includes(customerName), "Must contain {{CUSTOMER_NAME}}");
  assert(contractText.includes(customerEmail), "Must contain {{CUSTOMER_EMAIL}}");
  assert(contractText.includes(beatTitle), "Must contain {{BEAT_NAME}}");
  assert(contractText.includes(beatId), "Must contain {{BEAT_ID}}");
  assert(contractText.includes("WAV"), "Must contain {{LICENSE_TIER}}");
  assert(contractText.includes("$49.00 USD"), "Must contain {{PURCHASE_PRICE}}");
  assert(contractText.includes("MP3 320 kbps + WAV 24-bit / 48 kHz"), "Must contain {{DELIVERABLES}}");
  assert(contractText.includes("NE-v1.0"), "Must contain {{CONTRACT_VERSION}}");
  assert(!contractText.includes("{{"), "No raw template placeholder tags must remain");
  assert(
    contractText.includes("RGODBEAT NON-EXCLUSIVE BEAT LICENSE AGREEMENT"),
    "Must use the official Non-Exclusive agreement title"
  );
  console.log("✓ All 11 variables injected cleanly into single master agreement");

  // 5. Test Vector PDF Generation (pdf-lib)
  console.log("\n[TEST 5] Testing Vector PDF Generation with pdf-lib...");
  const pdfBytes = await generateContractPdfBuffer({
    orderId,
    customerName,
    customerEmail,
    beatTitle,
    beatId,
    licenseTier: "wav",
    amountPaid: 49,
    currency: "USD",
    licenseId,
    version: CONTRACT_VERSIONS.NON_EXCLUSIVE,
  });

  assert(pdfBytes && pdfBytes.length > 500, "PDF bytes must be generated");
  const header = Buffer.from(pdfBytes.slice(0, 5)).toString();
  assert.strictEqual(header, "%PDF-", "Generated buffer must be a valid PDF");
  console.log(`✓ Personalized Vector PDF generated successfully (${pdfBytes.length} bytes)`);

  // 6. Test Version Pinning & Extraction from Historical Purchases
  console.log("\n[TEST 6] Testing Historical Purchase Version Pinning...");
  const mockOldPurchase = {
    id: "old_purchase_001",
    license_tier: "mp3",
    created_at: "2026-09-20T10:00:00Z",
    contract_text: `================================================================================
RGODBEAT MUSIC PRODUCTION
RGODBEAT NON-EXCLUSIVE BEAT LICENSE AGREEMENT
VERSION: NE-v1.0
LICENSE ID: RG-MP3-2026-000007
================================================================================`,
  };

  const extracted = extractLicenseMetadata(mockOldPurchase);
  assert.strictEqual(extracted.licenseId, "RG-MP3-2026-000007", "Should extract original License ID");
  assert.strictEqual(extracted.contractVersion, "NE-v1.0", "Should retain original contract version");
  assert.strictEqual(extracted.deliverables, "MP3 320 kbps");
  console.log("✓ Historic purchase pinned cleanly to its original version and License ID");

  console.log("\n=== ALL ARCHITECTURAL TESTS PASSED SUCCESSFULLY ===");
}

runComprehensiveTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
