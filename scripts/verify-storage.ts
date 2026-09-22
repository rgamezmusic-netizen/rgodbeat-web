import {
  PUBLIC_STORAGE_BUCKET,
  getPublicCoverPath,
  getPublicPreviewPath,
  validatePublicPath,
  getPublicStorageUrl,
} from "../lib/storage/public";

import {
  PRIVATE_STORAGE_BUCKET,
  getPrivateBeatWavPath,
  getPrivateBeatStemsPath,
  getPrivateBeatExclusivePath,
  getPrivateContractPath,
  validatePrivatePath,
  resolvePrivateDownloadUrl,
} from "../lib/storage/private";

async function runStorageVerification() {
  console.log("==================================================================");
  console.log("🔒 RGODBEAT 2.0 — STORAGE ARCHITECTURE & SECURITY VERIFICATION");
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

  // 1. Verify Bucket Constants
  assert(PUBLIC_STORAGE_BUCKET === "rgodbeat-public", "Public bucket identifier is 'rgodbeat-public'");
  assert(PRIVATE_STORAGE_BUCKET === "rgodbeat-private", "Private bucket identifier is 'rgodbeat-private'");

  // 2. Verify Public Path Generation
  const coverPath = getPublicCoverPath("beat_123");
  assert(coverPath === "covers/beat_123/cover.jpg", "Public cover path matches format 'covers/{beat_id}/cover.jpg'");

  const previewPath = getPublicPreviewPath("beat_123");
  assert(previewPath === "previews/beat_123/preview.mp3", "Public preview path matches format 'previews/{beat_id}/preview.mp3'");

  // 3. Verify Public Path Validation
  assert(validatePublicPath("covers/beat_123/cover.jpg") === true, "Valid cover path accepted");
  assert(validatePublicPath("previews/beat_123/preview.mp3") === true, "Valid preview path accepted");
  assert(validatePublicPath("covers/../private/file.wav") === false, "Path traversal attempt rejected");
  assert(validatePublicPath("beats/beat_123/wav/master.wav") === false, "Private path rejected from public validation");
  assert(validatePublicPath("/absolute/path/file.jpg") === false, "Absolute path rejected");

  // 4. Verify Public CDN URL Resolution
  const cdnUrl = getPublicStorageUrl("covers/beat_123/cover.jpg");
  assert(
    cdnUrl !== null && cdnUrl.includes("/storage/v1/object/public/rgodbeat-public/covers/beat_123/cover.jpg"),
    "Public storage URL properly constructed from public path"
  );

  const invalidUrl = getPublicStorageUrl("beats/beat_123/wav/master.wav");
  assert(invalidUrl === null, "Private path cannot be resolved as a public storage URL (security check)");

  // 5. Verify Private Path Generation
  const wavPath = getPrivateBeatWavPath("beat_123", "master.wav");
  assert(wavPath === "beats/beat_123/wav/master.wav", "Private WAV path matches 'beats/{beat_id}/wav/{filename}'");

  const stemsPath = getPrivateBeatStemsPath("beat_123", "stems.zip");
  assert(stemsPath === "beats/beat_123/stems/stems.zip", "Private Stems path matches 'beats/{beat_id}/stems/{filename}'");

  const exclusivePath = getPrivateBeatExclusivePath("beat_123", "full_package.zip");
  assert(exclusivePath === "beats/beat_123/exclusive/full_package.zip", "Private Exclusive path matches 'beats/{beat_id}/exclusive/{filename}'");

  const contractPath = getPrivateContractPath("beat_123", "license_agreement.pdf");
  assert(contractPath === "contracts/beat_123/license_agreement.pdf", "Private Contract path matches 'contracts/{beat_id}/{filename}'");

  // 6. Verify Private Path Validation
  assert(validatePrivatePath("beats/beat_123/wav/master.wav") === true, "Valid WAV path accepted");
  assert(validatePrivatePath("beats/beat_123/stems/stems.zip") === true, "Valid Stems path accepted");
  assert(validatePrivatePath("contracts/beat_123/license.pdf") === true, "Valid Contract path accepted");
  assert(validatePrivatePath("covers/beat_123/cover.jpg") === false, "Public path rejected from private validation");
  assert(validatePrivatePath("beats/beat_123/wav/../../etc/passwd") === false, "Private path traversal rejected");

  // 7. Verify Signed Download Safety (No premature signed URLs)
  let threwExpectedSecurityError = false;
  try {
    await resolvePrivateDownloadUrl({
      beatId: "beat_123",
      fileType: "wav",
      storagePath: wavPath,
    });
  } catch (err: any) {
    if (err.message && err.message.includes("Security Exception")) {
      threwExpectedSecurityError = true;
    }
  }
  assert(threwExpectedSecurityError, "Signed download generation safely disabled until purchase auth integration");

  console.log("==================================================================");
  console.log(`STORAGE VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStorageVerification();
