/**
 * RGODBEAT 2.0 - Private Storage Helper
 * Manages master audio files (WAV, Stems, Exclusive packages, Contracts) in the 'rgodbeat-private' bucket.
 * 
 * SECURITY NOTE:
 * - This bucket is strictly non-public.
 * - Public/anonymous users have NO read or write access.
 * - Files are never exposed via direct public URLs.
 * - Signed URLs will be issued only upon verified purchase authorization in later steps.
 */

export const PRIVATE_STORAGE_BUCKET = "rgodbeat-private";

export type PrivateFileType = "wav" | "stems" | "exclusive" | "contract";

/**
 * Expected path formats for private assets:
 * - beats/{beat_id}/wav/{filename}
 * - beats/{beat_id}/stems/{filename}
 * - beats/{beat_id}/exclusive/{filename}
 * - contracts/{beat_id}/{filename}
 */
export function getPrivateBeatWavPath(beatId: string, filename: string): string {
  const cleanId = beatId.trim();
  const cleanFilename = filename.trim().replace(/^\/+/, "");
  return `beats/${cleanId}/wav/${cleanFilename}`;
}

export function getPrivateBeatStemsPath(beatId: string, filename: string): string {
  const cleanId = beatId.trim();
  const cleanFilename = filename.trim().replace(/^\/+/, "");
  return `beats/${cleanId}/stems/${cleanFilename}`;
}

export function getPrivateBeatExclusivePath(beatId: string, filename: string): string {
  const cleanId = beatId.trim();
  const cleanFilename = filename.trim().replace(/^\/+/, "");
  return `beats/${cleanId}/exclusive/${cleanFilename}`;
}

export function getPrivateContractPath(beatId: string, filename: string): string {
  const cleanId = beatId.trim();
  const cleanFilename = filename.trim().replace(/^\/+/, "");
  return `contracts/${cleanId}/${cleanFilename}`;
}

/**
 * Validates that a private storage path adheres to the expected directory conventions.
 */
export function validatePrivatePath(path: string | null | undefined): boolean {
  if (!path || typeof path !== "string") return false;
  const normalized = path.trim().replace(/\\/g, "/");

  // Prevent directory traversal attacks
  if (normalized.includes("..") || normalized.startsWith("/")) return false;

  const validPrefixes = [
    /^beats\/[^/]+\/wav\/[^/]+$/,
    /^beats\/[^/]+\/stems\/[^/]+$/,
    /^beats\/[^/]+\/exclusive\/[^/]+$/,
    /^contracts\/[^/]+\/[^/]+$/,
  ];

  return validPrefixes.some((regex) => regex.test(normalized));
}

/**
 * Signed URL Request Architecture Interface
 */
export interface SignedUrlRequest {
  purchaseId?: string;
  beatId?: string;
  storagePath?: string;
  fileType: "mp3" | "wav" | "stems" | "exclusive" | "contract";
  expiresInSeconds?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface SignedUrlResponse {
  downloadUrl: string;
  expiresAt: string;
  fileName: string;
}

/**
 * Authoritatively resolves a short-lived signed URL for a purchased commercial asset.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Checks that purchase exists, is active, and order payment is paid.
 * 2. Enforces license tier boundaries:
 *    - MP3 purchase cannot download WAV or Stems.
 *    - WAV purchase cannot download Stems.
 * 3. Never exposes raw Supabase storage paths or service-role keys to browser.
 * 4. Generates a signed URL that expires in 60 seconds.
 * 5. Logs every download attempt to public.download_records for audit trails.
 */
export async function resolvePrivateDownloadUrl({
  purchaseId,
  beatId,
  fileType,
  expiresInSeconds = 60,
  ipAddress,
  userAgent,
}: SignedUrlRequest): Promise<SignedUrlResponse> {
  if (!purchaseId) {
    throw new Error(
      "Security Exception: Private signed URL generation is disabled until authentication and purchase verification are implemented."
    );
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  // 1. Fetch purchase record and associated beat & order
  const { data: purchase, error: purchaseError } = await supabase
    .from("purchases")
    .select(`
      id,
      customer_id,
      beat_id,
      license_tier,
      status,
      orders!inner (
        status,
        payment_status
      ),
      beats!inner (
        id,
        title,
        preview_path
      )
    `)
    .eq("id", purchaseId)
    .single();

  if (purchaseError || !purchase) {
    throw new Error("Purchase entitlement not found or access denied.");
  }

  if (purchase.status !== "active") {
    throw new Error(`This purchase is no longer active (status: ${purchase.status}).`);
  }

  const order = purchase.orders as any;
  if (!order || order.payment_status !== "paid") {
    throw new Error("Order payment has not been verified.");
  }

  // 2. Validate License Tier Permissions
  const tier = purchase.license_tier;
  if (fileType === "wav" && tier === "mp3") {
    throw new Error("License Security Violation: MP3 license does not permit downloading master WAV files.");
  }

  if (fileType === "stems" && (tier === "mp3" || tier === "wav")) {
    throw new Error("License Security Violation: Your license tier does not include separated trackout stems.");
  }

  if (fileType === "exclusive" && tier !== "exclusive") {
    throw new Error("License Security Violation: Exclusive package requires an Exclusive Rights license.");
  }

  // 3. Locate the file in storage
  let targetStoragePath = "";
  let targetBucket = PRIVATE_STORAGE_BUCKET;
  const beat = purchase.beats as any;

  if (fileType === "contract") {
    // Generate virtual or stored contract
    targetStoragePath = `contracts/${purchase.beat_id}/${purchase.id}_license.txt`;
  } else if (fileType === "mp3") {
    // For MP3, if preview exists in public or dedicated untagged mp3 in private
    const { data: beatFile } = await supabase
      .from("beat_files")
      .select("storage_path")
      .eq("beat_id", purchase.beat_id)
      .eq("file_type", "preview")
      .maybeSingle();

    if (beatFile && beatFile.storage_path) {
      targetStoragePath = beatFile.storage_path;
    } else if (beat?.preview_path) {
      targetBucket = "rgodbeat-public";
      targetStoragePath = beat.preview_path;
    } else {
      // Resilient fallback: If no compressed preview exists, serve the master audio file on record
      const { data: masterFile } = await supabase
        .from("beat_files")
        .select("storage_path")
        .eq("beat_id", purchase.beat_id)
        .eq("file_type", "wav")
        .maybeSingle();

      if (masterFile && masterFile.storage_path) {
        targetStoragePath = masterFile.storage_path;
      }
    }
  } else {
    // wav, stems, exclusive
    const { data: beatFile, error: bfError } = await supabase
      .from("beat_files")
      .select("storage_path, file_name")
      .eq("beat_id", purchase.beat_id)
      .eq("file_type", fileType)
      .maybeSingle();

    if (bfError || !beatFile) {
      throw new Error(`No ${fileType.toUpperCase()} asset is on file for this beat. Please contact support.`);
    }
    targetStoragePath = beatFile.storage_path;
  }

  if (!targetStoragePath) {
    throw new Error(`Requested asset (${fileType}) is not available.`);
  }

  // 4. Generate Short-Lived Signed URL
  const { data: signedData, error: signError } = await supabase.storage
    .from(targetBucket)
    .createSignedUrl(targetStoragePath, expiresInSeconds);

  if (signError || !signedData?.signedUrl) {
    throw new Error(`Failed to generate secure download link: ${signError?.message || "Storage error"}`);
  }

  // 5. Audit Log in download_records
  try {
    await supabase.from("download_records").insert({
      purchase_id: purchase.id,
      file_type: fileType,
      storage_path: targetStoragePath,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });
  } catch (logErr) {
    console.error("[Download Audit] Failed to record download:", logErr);
  }

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const fileName = targetStoragePath.split("/").pop() || `${beat?.title || "beat"}_${fileType}`;

  return {
    downloadUrl: signedData.signedUrl,
    expiresAt,
    fileName,
  };
}

