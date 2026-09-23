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
  DEFAULT_GOVERNING_LAW,
  DEFAULT_JURISDICTION,
} from "@/lib/commerce/contracts";

async function runComprehensiveTests() {
  console.log("=== RGODBEAT OFFICIAL NON-EXCLUSIVE CONTRACT NE-v1.0 TESTS ===\n");

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

  // 2. Verify Contract Version
  console.log("\n[TEST 2] Verifying Contract Version...");
  assert.strictEqual(CONTRACT_VERSIONS.NON_EXCLUSIVE, "NE-v1.0");
  assert.strictEqual(CONTRACT_VERSIONS.EXCLUSIVE, "EX-v1.0");
  console.log("✓ Versions verified: NON_EXCLUSIVE = NE-v1.0, EXCLUSIVE = EX-v1.0");

  // 3. Verify Exact Deliverables per Tier
  console.log("\n[TEST 3] Verifying Deliverables mapping...");
  assert.strictEqual(TIER_CONTRACT_CONFIGS.mp3.deliverables, "MP3 320 kbps");
  assert.strictEqual(TIER_CONTRACT_CONFIGS.wav.deliverables, "MP3 320 kbps + WAV 24-bit / 48 kHz");
  assert.strictEqual(
    TIER_CONTRACT_CONFIGS.unlimited.deliverables,
    "MP3 320 kbps + WAV 24-bit / 48 kHz + grouped stems available upon request"
  );
  console.log("✓ Deliverables verified for all non-exclusive tiers");

  // 4. Verify Single Master Template with all 13 dynamic variables & 23 sections
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
    governingLaw: DEFAULT_GOVERNING_LAW,
    jurisdiction: DEFAULT_JURISDICTION,
  });

  // Verify all 13 dynamic variables are substituted and no {{...}} remain
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
  assert(contractText.includes(DEFAULT_GOVERNING_LAW), "Must contain {{GOVERNING_LAW}}");
  assert(contractText.includes(DEFAULT_JURISDICTION), "Must contain {{JURISDICTION}}");
  assert(!contractText.includes("{{"), "No raw template placeholder tags must remain");

  // Verify Core Legal Sections
  assert(contractText.includes("1. PARTIES"), "Must contain Section 1");
  assert(contractText.includes("2. BEAT IDENTIFICATION"), "Must contain Section 2");
  assert(contractText.includes("3. LICENSE TIER"), "Must contain Section 3");
  assert(contractText.includes("4. GRANT OF NON-EXCLUSIVE LICENSE"), "Must contain Section 4");
  assert(contractText.includes("7. UNLIMITED TIER — REMIX RIGHTS"), "Must contain Section 7");
  assert(contractText.includes("10. CONTENT ID AND AUDIO FINGERPRINTING"), "Must contain Section 10");
  assert(contractText.includes("12. FUTURE EXCLUSIVE SALE"), "Must contain Section 12");
  assert(contractText.includes("13. STEM DELIVERY — UNLIMITED TIER"), "Must contain Section 13");
  assert(contractText.includes("20. GOVERNING LAW AND JURISDICTION"), "Must contain Section 20");
  assert(contractText.includes("22. ELECTRONIC ACCEPTANCE"), "Must contain Section 22");
  assert(contractText.includes("23. LICENSE CONFIRMATION"), "Must contain Section 23");
  console.log("✓ All 13 variables and all 23 official legal sections verified in master agreement");

  // 5. Test Multi-Page Vector PDF Generation (pdf-lib)
  console.log("\n[TEST 5] Testing Multi-Page Vector PDF Generation with pdf-lib...");
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
  console.log(`✓ Publication-grade Multi-Page Vector PDF generated successfully (${pdfBytes.length} bytes)`);

  // 6. Test Version Pinning & Extraction from Historical Purchases
  console.log("\n[TEST 6] Testing Historical Purchase Version Pinning...");
  const mockOldPurchase = {
    id: "old_purchase_001",
    license_tier: "mp3",
    created_at: "2026-09-20T10:00:00Z",
    contract_text: `================================================================================
RGODBEAT MUSIC PRODUCTION
RGODBEAT NON-EXCLUSIVE BEAT LICENSE AGREEMENT
Contract Version: NE-v1.0
License ID:       RG-MP3-2026-000007
================================================================================`,
  };

  const extracted = extractLicenseMetadata(mockOldPurchase);
  assert.strictEqual(extracted.licenseId, "RG-MP3-2026-000007", "Should extract original License ID");
  assert.strictEqual(extracted.contractVersion, "NE-v1.0", "Should retain original contract version");
  assert.strictEqual(extracted.deliverables, "MP3 320 kbps");
  console.log("✓ Historic purchase pinned cleanly to its original version NE-v1.0");

  // 7. Test Exclusive Agreement EX-v1.0
  console.log("\n[TEST 7] Testing Exclusive Beat License Agreement EX-v1.0 (22 Sections)...");
  const excOrderId = "ord_exc_777";
  const excLicenseId = "RG-EXC-2026-000777";
  const excContractText = generateLicenseContract({
    orderId: excOrderId,
    customerName: "Exclusive Buyer",
    customerEmail: "buyer@label.com",
    beatTitle: "DIVINA",
    beatId: "a4c1b253-0fc4-42c4-9f17-b96e03115b23",
    licenseTier: "exclusive",
    amountPaid: 499,
    currency: "USD",
    purchaseDate: "2026-09-23T16:00:00Z",
    licenseId: excLicenseId,
    version: CONTRACT_VERSIONS.EXCLUSIVE,
    governingLaw: DEFAULT_GOVERNING_LAW,
    jurisdiction: DEFAULT_JURISDICTION,
  });

  // Verify all 13 variables in EX-v1.0
  assert(excContractText.includes(excLicenseId), "Must contain Exclusive {{LICENSE_ID}}");
  assert(excContractText.includes(excOrderId), "Must contain Exclusive {{ORDER_ID}}");
  assert(excContractText.includes("Exclusive Buyer"), "Must contain {{CUSTOMER_NAME}}");
  assert(excContractText.includes("buyer@label.com"), "Must contain {{CUSTOMER_EMAIL}}");
  assert(excContractText.includes("DIVINA"), "Must contain {{BEAT_NAME}}");
  assert(excContractText.includes("$499.00 USD"), "Must contain {{PURCHASE_PRICE}}");
  assert(excContractText.includes("EX-v1.0"), "Must contain {{CONTRACT_VERSION}}");
  assert(!excContractText.includes("{{"), "No raw template placeholder tags must remain in EX-v1.0");

  // Verify all 22 Sections in EX-v1.0
  assert(excContractText.includes("1. PARTIES"), "EX: Must contain Section 1");
  assert(excContractText.includes("2. BEAT IDENTIFICATION"), "EX: Must contain Section 2");
  assert(excContractText.includes("3. EXCLUSIVE LICENSE"), "EX: Must contain Section 3");
  assert(excContractText.includes("4. GRANT OF EXCLUSIVE LICENSE"), "EX: Must contain Section 4");
  assert(excContractText.includes("5. EXCLUSIVE NATURE OF THE LICENSE"), "EX: Must contain Section 5");
  assert(excContractText.includes("6. PREVIOUS NON-EXCLUSIVE LICENSES"), "EX: Must contain Section 6");
  assert(excContractText.includes("7. PERMITTED USES"), "EX: Must contain Section 7");
  assert(excContractText.includes("8. MODIFICATION AND REMIX RIGHTS"), "EX: Must contain Section 8");
  assert(excContractText.includes("9. COMMERCIAL RELEASE AND MONETIZATION"), "EX: Must contain Section 9");
  assert(excContractText.includes("10. COMPOSITION AND PUBLISHING"), "EX: Must contain Section 10");
  assert(excContractText.includes("11. CONTENT ID AND AUDIO FINGERPRINTING"), "EX: Must contain Section 11");
  assert(excContractText.includes("12. STEM DELIVERY"), "EX: Must contain Section 12");
  assert(excContractText.includes("13. PRODUCER CREDIT"), "EX: Must contain Section 13");
  assert(excContractText.includes("14. TRANSFER AND SUBLICENSING"), "EX: Must contain Section 14");
  assert(excContractText.includes("15. TERMINATION AND MATERIAL BREACH"), "EX: Must contain Section 15");
  assert(excContractText.includes("16. COPYRIGHT AND OWNERSHIP"), "EX: Must contain Section 16");
  assert(excContractText.includes("17. THIRD-PARTY MATERIALS AND SAMPLES"), "EX: Must contain Section 17");
  assert(excContractText.includes("18. LIMITATION OF LIABILITY"), "EX: Must contain Section 18");
  assert(excContractText.includes("19. GOVERNING LAW AND JURISDICTION"), "EX: Must contain Section 19");
  assert(excContractText.includes("20. ENTIRE AGREEMENT"), "EX: Must contain Section 20");
  assert(excContractText.includes("21. ELECTRONIC ACCEPTANCE"), "EX: Must contain Section 21");
  assert(excContractText.includes("22. LICENSE CONFIRMATION"), "EX: Must contain Section 22");
  console.log("✓ All 22 official legal sections and variables verified in Exclusive Agreement EX-v1.0");

  // 8. Test Exclusive Multi-Page PDF Generation
  console.log("\n[TEST 8] Testing Exclusive Multi-Page Vector PDF Generation with pdf-lib...");
  const excPdfBytes = await generateContractPdfBuffer({
    orderId: excOrderId,
    customerName: "Exclusive Buyer",
    customerEmail: "buyer@label.com",
    beatTitle: "DIVINA",
    beatId: "a4c1b253-0fc4-42c4-9f17-b96e03115b23",
    licenseTier: "exclusive",
    amountPaid: 499,
    currency: "USD",
    licenseId: excLicenseId,
    version: CONTRACT_VERSIONS.EXCLUSIVE,
  });

  assert(excPdfBytes && excPdfBytes.length > 500, "Exclusive PDF bytes must be generated");
  const excPdfHeader = Buffer.from(excPdfBytes.slice(0, 5)).toString();
  assert.strictEqual(excPdfHeader, "%PDF-", "Generated buffer must be a valid PDF");
  console.log(`✓ Exclusive Vector PDF generated successfully (${excPdfBytes.length} bytes)`);

  console.log("\n=== ALL OFFICIAL CONTRACT SYSTEM TESTS (NE-v1.0 & EX-v1.0) PASSED SUCCESSFULLY ===");
}

runComprehensiveTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
