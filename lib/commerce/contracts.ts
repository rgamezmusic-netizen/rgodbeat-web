import { LicenseTier } from "@/types";

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

  const tierTitles: Record<LicenseTier, string> = {
    mp3: "STANDARD MP3 LEASE AGREEMENT",
    wav: "PREMIUM WAV MASTER LEASE AGREEMENT",
    stems: "TRACKOUT STEMS COMMERCIAL LICENSE AGREEMENT",
    unlimited: "UNLIMITED COMMERCIAL MASTER LICENSE AGREEMENT",
    exclusive: "EXCLUSIVE MASTER COPYRIGHT TRANSFER & ASSIGNMENT AGREEMENT",
  };

  const tierRights: Record<LicenseTier, string[]> = {
    mp3: [
      "- Distribution Limit: Up to 100,000 commercial audio streams across digital platforms (Spotify, Apple Music, Tidal, etc.).",
      "- Music Video: Up to 1 non-monetized music video.",
      "- Broadcasting: Non-commercial radio and live performances permitted.",
      "- Exclusivity: Non-exclusive. RGODBEAT retains full copyright and rights to license to other artists.",
      "- Credit Requirement: Must credit 'Prod. by RGODBEAT' on all written, digital, and visual releases.",
    ],
    wav: [
      "- Distribution Limit: Up to 500,000 commercial audio streams across digital platforms.",
      "- Music Video: Up to 2 commercial music videos (monetized YouTube streaming permitted).",
      "- Broadcasting: Commercial radio airplay up to 2 stations.",
      "- Audio Quality: Includes uncompressed 24-bit studio master WAV + high quality MP3.",
      "- Exclusivity: Non-exclusive. RGODBEAT retains full copyright.",
      "- Credit Requirement: Must credit 'Prod. by RGODBEAT' on all releases.",
    ],
    stems: [
      "- Distribution Limit: Up to 1,000,000 commercial audio streams across digital platforms.",
      "- Multitrack Access: Full separated studio trackout WAV stems (drums, bass, synths, fx, vocals) + master WAV.",
      "- Music Video: Unlimited commercial music videos.",
      "- Broadcasting: Radio airplay permitted.",
      "- Exclusivity: Non-exclusive. RGODBEAT retains underlying composition copyright.",
      "- Credit Requirement: Must credit 'Prod. by RGODBEAT' on all releases.",
    ],
    unlimited: [
      "- Distribution Limit: UNLIMITED audio streams across all digital platforms worldwide.",
      "- Physical Distribution: Unlimited physical copies (CDs, vinyl, cassettes) and digital downloads.",
      "- Performance Rights: Unlimited for-profit live performances and radio broadcasting.",
      "- Multitrack Access: Full uncompressed 24-bit master WAV + all separated stems included.",
      "- Exclusivity: Non-exclusive; licensor will not sell exclusive rights to third parties following this agreement.",
      "- Credit Requirement: Must credit 'Prod. by RGODBEAT' on all releases.",
    ],
    exclusive: [
      "- Ownership: FULL OWNERSHIP TRANSFER AND MASTER COPYRIGHT ASSIGNMENT.",
      "- Store Removal: The beat is permanently retired from the RGODBEAT public catalog.",
      "- Distribution: Unlimited commercial distribution, synchronization (film/TV/games), and physical sales.",
      "- Derivative Works: Licensee possesses exclusive commercial rights to create and exploit master sound recordings.",
      "- Royalties: 100% of master recording royalties belonging to Licensee. Publishing split: 50% Writer / 50% Composer as standard industry practice.",
      "- Credit Requirement: Must credit 'Prod. by RGODBEAT'.",
    ],
  };

  const title = tierTitles[licenseTier] || "COMMERCIAL LICENSE AGREEMENT";
  const rightsList = (tierRights[licenseTier] || tierRights.mp3).join("\n");

  return `================================================================================
RGODBEAT MUSIC PRODUCTION — OFFICIAL LEGAL LICENSE AGREEMENT
${title}
================================================================================

ORDER ID: ${orderId}
DATE OF EXECUTION: ${formattedDate}

1. PARTIES:
   - LICENSOR: RGODBEAT (Production & Sound Design)
   - LICENSEE: ${customerName || "Customer"} (${customerEmail})

2. LICENSED WORK:
   - BEAT TITLE: "${beatTitle}"
   - BEAT IDENTIFIER: ${beatId}
   - LICENSE TIER: ${licenseTier.toUpperCase()}
   - TOTAL CONSIDERATION: $${amountPaid.toFixed(2)} ${currency} (PAID IN FULL)

3. GRANTED RIGHTS & USAGE LIMITATIONS:
${rightsList}

4. GENERAL PROVISIONS:
   - This Agreement is valid worldwide and in perpetuity upon verified completion of payment.
   - Any unauthorized public distribution, resale, or sublicensing outside the agreed terms constitutes copyright infringement.
   - Master sound files are provided digitally via the secure RGODBEAT delivery system.

IN WITNESS WHEREOF, this Agreement is executed and rendered legally binding via cryptographic transaction verification on the date above.

Licensor: RGODBEAT
Authorized Digital Signature: [RGODBEAT VERIFIED TRANSACTION]
================================================================================`;
}
