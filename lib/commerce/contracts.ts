import fs from "fs";
import path from "path";
import { LicenseTier } from "@/types";
import { getR2SignedDownloadUrl, doesR2ObjectExist } from "@/lib/storage/r2";

interface GenerateContractParams {
  orderId: string;
  customerName: string;
  customerEmail: string;
  beatTitle: string;
  beatId: string;
  licenseTier: LicenseTier;
  amountPaid: number;
  currency?: string;
  purchaseDate?: string;
}

export const TIER_DISPLAY_NAMES: Record<string, string> = {
  mp3: "MP3 LICENSE",
  wav: "WAV LICENSE",
  unlimited: "UNLIMITED LICENSE",
  exclusive: "EXCLUSIVE LICENSE",
};

export const TIER_OFFICIAL_FEATURES: Record<string, string[]> = {
  mp3: [
    "Non-Exclusive",
    "MP3 320 kbps",
  ],
  wav: [
    "Non-Exclusive",
    "MP3 320 kbps",
    "WAV 24-bit / 48 kHz",
  ],
  unlimited: [
    "Non-Exclusive",
    "MP3",
    "WAV",
    "Includes access to grouped stems upon request",
  ],
  exclusive: [
    "Exclusive",
    "MP3",
    "WAV",
    "Includes access to grouped stems upon request",
  ],
};

/**
 * Generates an authoritative, neutral pre-execution agreement receipt.
 * NO speculative streaming limits, publishing splits, or Content ID rules are asserted.
 */
export function generateLicenseContract({
  orderId,
  customerName,
  customerEmail,
  beatTitle,
  beatId,
  licenseTier,
  amountPaid,
  currency = "USD",
  purchaseDate = new Date().toISOString(),
}: GenerateContractParams): string {
  const formattedDate = new Date(purchaseDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const tierKey = licenseTier.toLowerCase();
  const tierTitle = TIER_DISPLAY_NAMES[tierKey] || `${licenseTier.toUpperCase()} LICENSE`;
  const features = TIER_OFFICIAL_FEATURES[tierKey] || ["Digital Master Audio Access"];
  const featuresText = features.map((f) => `   - ${f}`).join("\n");

  return `================================================================================
RGODBEAT MUSIC PRODUCTION — BEAT LICENSE ORDER CERTIFICATION
${tierTitle}
================================================================================

ORDER IDENTIFIER: ${orderId}
DATE OF ISSUE:    ${formattedDate}

1. PARTIES:
   - LICENSOR: RGODBEAT (Official Producer & Catalog Rights Holder)
   - LICENSEE: ${customerName || "Customer"} (${customerEmail})

2. LICENSED PRODUCTION:
   - BEAT TITLE:      "${beatTitle}"
   - BEAT CATALOG ID: ${beatId}
   - LICENSE PRODUCT: ${tierTitle}
   - CONSIDERATION:   $${amountPaid.toFixed(2)} ${currency} (PAID IN FULL)

3. INCLUDED ASSETS & SPECIFICATIONS:
${featuresText}

4. OFFICIAL LICENSE AGREEMENT NOTICE:
   - This document certifies authorized acquisition and valid consideration for the
     specified beat and license product.
   - Comprehensive legal terms, rights definitions, and operational provisions are
     governed by the official RGODBEAT Beat License Agreement (PDF).
   - Master sound files are made accessible through your secure RGODBEAT customer portal.

================================================================================
Licensor: RGODBEAT
Contact:  rgodbeat@gmail.com
Status:   OFFICIAL PURCHASE ENTITLEMENT CONFIRMED
================================================================================`;
}

export interface ContractAssetResult {
  hasPdf: boolean;
  pdfPath?: string;
  pdfUrl?: string;
  sourceType: "r2" | "local" | "text_fallback";
  fileName: string;
}

/**
 * Authoritatively resolves whether an official PDF contract exists for a given beat and tier.
 * Checks:
 * 1. Beat-specific PDF in Cloudflare R2: `beats/${beatId}/contracts/${licenseTier}.pdf`
 * 2. Official Tier Agreement PDF in Cloudflare R2: `contracts/rgodbeat_${licenseTier}_license_agreement.pdf`
 * 3. Local filesystem in `public/contracts/rgodbeat_${licenseTier}_license_agreement.pdf` or `public/contracts/${licenseTier}.pdf`
 *
 * When official PDFs are uploaded, this resolver immediately finds them with ZERO checkout rebuilding.
 */
export async function resolveContractAsset(params: {
  beatId: string;
  licenseTier: string;
  beatTitle?: string;
}): Promise<ContractAssetResult> {
  const { beatId, licenseTier, beatTitle = "RGODBEAT" } = params;
  const cleanTitle = beatTitle.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanTier = licenseTier.toLowerCase();
  const pdfDownloadName = `${cleanTitle}_${cleanTier.toUpperCase()}_License_Agreement.pdf`;

  // 1. Check Cloudflare R2 for beat-specific contract
  const r2BeatKey = `beats/${beatId}/contracts/${cleanTier}.pdf`;
  const existsBeatR2 = await doesR2ObjectExist(r2BeatKey);
  if (existsBeatR2) {
    const downloadUrl = await getR2SignedDownloadUrl(r2BeatKey, 120);
    if (downloadUrl) {
      return {
        hasPdf: true,
        pdfUrl: downloadUrl,
        sourceType: "r2",
        fileName: pdfDownloadName,
      };
    }
  }

  // 2. Check Cloudflare R2 for tier standard agreement
  const r2TierKey = `contracts/rgodbeat_${cleanTier}_license_agreement.pdf`;
  const existsTierR2 = await doesR2ObjectExist(r2TierKey);
  if (existsTierR2) {
    const downloadUrl = await getR2SignedDownloadUrl(r2TierKey, 120);
    if (downloadUrl) {
      return {
        hasPdf: true,
        pdfUrl: downloadUrl,
        sourceType: "r2",
        fileName: pdfDownloadName,
      };
    }
  }

  // 3. Check local filesystem in public/contracts/
  const localCandidates = [
    path.join(process.cwd(), "public", "contracts", `rgodbeat_${cleanTier}_license_agreement.pdf`),
    path.join(process.cwd(), "public", "contracts", `${cleanTier}_license_agreement.pdf`),
    path.join(process.cwd(), "public", "contracts", `${cleanTier}.pdf`),
  ];

  for (const candidate of localCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
      return {
        hasPdf: true,
        pdfPath: candidate,
        sourceType: "local",
        fileName: pdfDownloadName,
      };
    }
  }

  // 4. Default: fallback to neutral formatted contract certification text
  return {
    hasPdf: false,
    sourceType: "text_fallback",
    fileName: `${cleanTitle}_${cleanTier.toUpperCase()}_License.txt`,
  };
}
