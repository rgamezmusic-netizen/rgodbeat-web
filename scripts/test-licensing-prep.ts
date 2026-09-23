import assert from "assert";
import fs from "fs";
import path from "path";
import { LICENSE_OPTIONS } from "@/lib/mock-data";
import { generateLicenseContract, resolveContractAsset } from "@/lib/commerce/contracts";

async function runTests() {
  console.log("=== RGODBEAT LICENSING & CONTRACT SYSTEM TESTS ===");

  // 1. Verify 4 License Products
  console.log("\n[TEST 1] Verifying 4 Official License Products & Prices...");
  assert.strictEqual(LICENSE_OPTIONS.length, 4, "Must have exactly 4 license options");
  const slugs = LICENSE_OPTIONS.map((l) => l.slug);
  assert.deepStrictEqual(slugs, ["mp3", "wav", "unlimited", "exclusive"]);
  assert(!slugs.includes("stems"), "STEMS must NOT be a purchasable standalone product");

  const priceMap = Object.fromEntries(LICENSE_OPTIONS.map((l) => [l.slug, l.price]));
  assert.strictEqual(priceMap.mp3, 29, "MP3 price must be $29");
  assert.strictEqual(priceMap.wav, 49, "WAV price must be $49");
  assert.strictEqual(priceMap.unlimited, 199, "UNLIMITED price must be $199");
  assert.strictEqual(priceMap.exclusive, 499, "EXCLUSIVE price must be $499");
  console.log("✓ All 4 products, slugs, and prices verified");

  // 2. Verify Feature Lists Match Specifications
  console.log("\n[TEST 2] Verifying Feature Specifications...");
  const mp3 = LICENSE_OPTIONS.find((l) => l.slug === "mp3")!;
  assert.deepStrictEqual(mp3.features, ["Non-Exclusive", "MP3 320 kbps"]);

  const wav = LICENSE_OPTIONS.find((l) => l.slug === "wav")!;
  assert.deepStrictEqual(wav.features, ["Non-Exclusive", "MP3 320 kbps", "WAV 24-bit / 48 kHz"]);

  const unlimited = LICENSE_OPTIONS.find((l) => l.slug === "unlimited")!;
  assert.deepStrictEqual(unlimited.features, [
    "Non-Exclusive",
    "MP3",
    "WAV",
    "Includes access to grouped stems upon request",
  ]);

  const exclusive = LICENSE_OPTIONS.find((l) => l.slug === "exclusive")!;
  assert.deepStrictEqual(exclusive.features, [
    "Exclusive",
    "MP3",
    "WAV",
    "Includes access to grouped stems upon request",
  ]);
  console.log("✓ All features match user requirements without speculative terms");

  // 3. Test generateLicenseContract
  console.log("\n[TEST 3] Testing generateLicenseContract()...");
  const sampleContract = generateLicenseContract({
    orderId: "ord_test_123",
    customerName: "Test Artist",
    customerEmail: "artist@example.com",
    beatTitle: "DIVINA",
    beatId: "a4c1b253-0fc4-42c4-9f17-b96e03115b23",
    licenseTier: "wav",
    amountPaid: 49,
    currency: "USD",
  });

  assert(sampleContract.includes("WAV LICENSE"), "Must reference WAV License");
  assert(sampleContract.includes("DIVINA"), "Must reference beat title");
  assert(sampleContract.includes("$49.00 USD"), "Must reference consideration");
  assert(!sampleContract.includes("100,000"), "Must NOT contain speculative 100k streams");
  assert(!sampleContract.includes("50% Writer"), "Must NOT contain speculative publishing split");
  console.log("✓ Contract receipt generated cleanly without speculative legal clauses");

  // 4. Test resolveContractAsset without PDF (Fallback to text)
  console.log("\n[TEST 4] Testing resolveContractAsset() fallback...");
  const fallbackAsset = await resolveContractAsset({
    beatId: "test_beat_id",
    licenseTier: "wav",
    beatTitle: "DIVINA",
  });
  assert.strictEqual(fallbackAsset.hasPdf, false);
  assert.strictEqual(fallbackAsset.sourceType, "text_fallback");
  assert.strictEqual(fallbackAsset.fileName, "DIVINA_WAV_License.txt");
  console.log("✓ Fallback to certification text verified");

  // 5. Test resolveContractAsset with Local PDF drop-in
  console.log("\n[TEST 5] Testing resolveContractAsset() with PDF drop-in...");
  const dummyPdfPath = path.join(process.cwd(), "public", "contracts", "wav_license_agreement.pdf");
  fs.writeFileSync(dummyPdfPath, "%PDF-1.4 dummy test pdf");
  try {
    const pdfAsset = await resolveContractAsset({
      beatId: "test_beat_id",
      licenseTier: "wav",
      beatTitle: "DIVINA",
    });
    assert.strictEqual(pdfAsset.hasPdf, true, "Must detect dropped-in PDF");
    assert.strictEqual(pdfAsset.sourceType, "local");
    assert.strictEqual(pdfAsset.fileName, "DIVINA_WAV_License_Agreement.pdf");
    console.log("✓ Zero-rebuild PDF detection verified successfully!");
  } finally {
    if (fs.existsSync(dummyPdfPath)) {
      fs.unlinkSync(dummyPdfPath);
    }
  }

  console.log("\n=== ALL LICENSING & CONTRACT PREPARATION TESTS PASSED ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
