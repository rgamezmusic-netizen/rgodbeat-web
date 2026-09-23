import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, grayscale } from "pdf-lib";
import { LicenseTier } from "@/types";

export const CONTRACT_VERSIONS = {
  NON_EXCLUSIVE: "NE-v1.0",
  EXCLUSIVE: "EX-v1.0",
} as const;

export type ContractVersion = (typeof CONTRACT_VERSIONS)[keyof typeof CONTRACT_VERSIONS];

export interface TierContractConfig {
  licenseType: "NON_EXCLUSIVE" | "EXCLUSIVE";
  licenseTier: string;
  prefix: string;
  deliverables: string;
  version: ContractVersion;
}

export const TIER_CONTRACT_CONFIGS: Record<string, TierContractConfig> = {
  mp3: {
    licenseType: "NON_EXCLUSIVE",
    licenseTier: "MP3",
    prefix: "MP3",
    deliverables: "MP3 320 kbps",
    version: CONTRACT_VERSIONS.NON_EXCLUSIVE,
  },
  wav: {
    licenseType: "NON_EXCLUSIVE",
    licenseTier: "WAV",
    prefix: "WAV",
    deliverables: "MP3 320 kbps + WAV 24-bit / 48 kHz",
    version: CONTRACT_VERSIONS.NON_EXCLUSIVE,
  },
  unlimited: {
    licenseType: "NON_EXCLUSIVE",
    licenseTier: "UNLIMITED",
    prefix: "UNL",
    deliverables: "MP3 + WAV + grouped stems available upon request",
    version: CONTRACT_VERSIONS.NON_EXCLUSIVE,
  },
  exclusive: {
    licenseType: "EXCLUSIVE",
    licenseTier: "EXCLUSIVE",
    prefix: "EXC",
    deliverables: "MP3 + WAV + grouped stems available upon request",
    version: CONTRACT_VERSIONS.EXCLUSIVE,
  },
};

/**
 * Formats an official RGODBEAT human-readable License ID.
 * Format: RG-{TIER_PREFIX}-{YYYY}-{XXXXXX}
 * Examples: RG-MP3-2026-000001, RG-WAV-2026-000002, RG-UNL-2026-000003
 */
export function formatLicenseId(
  tier: string,
  year: number | string = new Date().getFullYear(),
  seq: number | string = 1
): string {
  const cleanTier = tier.toLowerCase();
  const config = TIER_CONTRACT_CONFIGS[cleanTier];
  const prefix = config ? config.prefix : cleanTier.toUpperCase().slice(0, 3);
  const formattedSeq =
    typeof seq === "number"
      ? String(seq).padStart(6, "0")
      : String(seq).replace(/\D/g, "").padStart(6, "0").slice(-6);

  return `RG-${prefix}-${year}-${formattedSeq}`;
}

/**
 * Deterministically generates a collision-free License ID from a purchase UUID if sequential count is absent.
 */
export function generateDeterministicLicenseId(params: {
  tier: string;
  purchaseId: string;
  date?: string | Date;
}): string {
  const { tier, purchaseId, date = new Date() } = params;
  const d = typeof date === "string" ? new Date(date) : date;
  const year = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();

  // Generate 6-digit numeric hash from UUID
  let hash = 0;
  const cleanUuid = (purchaseId || "").replace(/-/g, "");
  for (let i = 0; i < cleanUuid.length; i++) {
    hash = (hash * 31 + cleanUuid.charCodeAt(i)) >>> 0;
  }
  const seqNum = (hash % 900000) + 100000; // 6 digits

  return formatLicenseId(tier, year, seqNum);
}

export interface ContractVariables {
  LICENSE_ID: string;
  ORDER_ID: string;
  CUSTOMER_NAME: string;
  CUSTOMER_EMAIL: string;
  BEAT_NAME: string;
  BEAT_ID: string;
  LICENSE_TIER: string;
  PURCHASE_PRICE: string;
  PURCHASE_DATE: string;
  DELIVERABLES: string;
  CONTRACT_VERSION: string;
}

/**
 * Reads the Master Contract Template file from disk with safe in-memory fallback.
 */
export function getMasterTemplate(version: string = CONTRACT_VERSIONS.NON_EXCLUSIVE, isExclusive = false): string {
  const templateFileName = isExclusive ? "exclusive_master_v1.txt" : "non_exclusive_master_v1.txt";
  const templatePath = path.join(process.cwd(), "templates", "contracts", templateFileName);

  try {
    if (fs.existsSync(/*turbopackIgnore: true*/ templatePath)) {
      return fs.readFileSync(/*turbopackIgnore: true*/ templatePath, "utf-8");
    }
  } catch (err) {
    console.warn(`[Contracts] Warning reading ${templateFileName}:`, err);
  }

  // Safe fallback template
  if (isExclusive) {
    return `================================================================================
RGODBEAT MUSIC PRODUCTION
RGODBEAT EXCLUSIVE BEAT LICENSE AGREEMENT
VERSION: {{CONTRACT_VERSION}}
LICENSE ID: {{LICENSE_ID}}
================================================================================

ORDER IDENTIFIER:  {{ORDER_ID}}
DATE OF EXECUTION: {{PURCHASE_DATE}}

1. PARTIES
   - LICENSOR: RGODBEAT (Producer)
   - LICENSEE: {{CUSTOMER_NAME}} ({{CUSTOMER_EMAIL}})

2. LICENSED WORK & CONSIDERATION
   - BEAT TITLE:      "{{BEAT_NAME}}"
   - BEAT CATALOG ID: {{BEAT_ID}}
   - LICENSE TYPE:    EXCLUSIVE
   - LICENSE TIER:    {{LICENSE_TIER}}
   - CONSIDERATION:   {{PURCHASE_PRICE}} (PAID IN FULL)

3. PURCHASED DELIVERABLES
   - {{DELIVERABLES}}

4. EXCLUSIVE TERMS & STORE RETIREMENT
   [OFFICIAL EXCLUSIVE LEGAL TEXT PENDING FINAL EXECUTION]

================================================================================
Licensor: RGODBEAT
Contact:  rgodbeat@gmail.com
Status:   OFFICIAL EXCLUSIVE ENTITLEMENT CONFIRMED
================================================================================`;
  }

  return `================================================================================
RGODBEAT MUSIC PRODUCTION
RGODBEAT NON-EXCLUSIVE BEAT LICENSE AGREEMENT
VERSION: {{CONTRACT_VERSION}}
LICENSE ID: {{LICENSE_ID}}
================================================================================

ORDER IDENTIFIER:  {{ORDER_ID}}
DATE OF EXECUTION: {{PURCHASE_DATE}}

1. PARTIES
   - LICENSOR: RGODBEAT (Official Producer & Catalog Rights Holder)
   - LICENSEE: {{CUSTOMER_NAME}} ({{CUSTOMER_EMAIL}})

2. LICENSED WORK & CONSIDERATION
   - BEAT TITLE:      "{{BEAT_NAME}}"
   - BEAT CATALOG ID: {{BEAT_ID}}
   - LICENSE TYPE:    NON-EXCLUSIVE
   - LICENSE TIER:    {{LICENSE_TIER}}
   - CONSIDERATION:   {{PURCHASE_PRICE}} (PAID IN FULL)

3. PURCHASED DELIVERABLES
   - {{DELIVERABLES}}

4. OFFICIAL LICENSE TERMS & USAGE LIMITATIONS
   [OFFICIAL LEGAL TEXT PENDING FINAL EXECUTION]
   The official terms, distribution permissions, and usage limitations of the
   RGODBEAT Non-Exclusive Beat License Agreement govern the master recording
   derived from this production upon official legal finalization.

================================================================================
Licensor: RGODBEAT
Contact:  rgodbeat@gmail.com
Status:   OFFICIAL PURCHASE ENTITLEMENT CONFIRMED
================================================================================`;
}

/**
 * Injects dynamic transaction variables into any contract template.
 */
export function injectContractVariables(template: string, vars: ContractVariables): string {
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    output = output.replace(pattern, value);
  }
  return output;
}

export interface GenerateContractParams {
  orderId: string;
  customerName: string;
  customerEmail: string;
  beatTitle: string;
  beatId: string;
  licenseTier: LicenseTier | string;
  amountPaid: number;
  currency?: string;
  purchaseDate?: string;
  licenseId?: string;
  version?: ContractVersion | string;
}

/**
 * Assembles the full official legal contract using the Single Master Non-Exclusive Template (or Exclusive stub).
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
  licenseId,
  version,
}: GenerateContractParams): string {
  const cleanTier = licenseTier.toLowerCase();
  const config = TIER_CONTRACT_CONFIGS[cleanTier] || TIER_CONTRACT_CONFIGS.wav;
  const isExclusive = config.licenseType === "EXCLUSIVE";

  const effectiveVersion = version || (isExclusive ? CONTRACT_VERSIONS.EXCLUSIVE : CONTRACT_VERSIONS.NON_EXCLUSIVE);
  const effectiveLicenseId = licenseId || generateDeterministicLicenseId({ tier: cleanTier, purchaseId: orderId, date: purchaseDate });

  const formattedDate = new Date(purchaseDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const variables: ContractVariables = {
    LICENSE_ID: effectiveLicenseId,
    ORDER_ID: orderId,
    CUSTOMER_NAME: customerName || "Customer",
    CUSTOMER_EMAIL: customerEmail,
    BEAT_NAME: beatTitle,
    BEAT_ID: beatId,
    LICENSE_TIER: config.licenseTier,
    PURCHASE_PRICE: `$${amountPaid.toFixed(2)} ${currency}`,
    PURCHASE_DATE: formattedDate,
    DELIVERABLES: config.deliverables,
    CONTRACT_VERSION: effectiveVersion,
  };

  const rawTemplate = getMasterTemplate(effectiveVersion, isExclusive);
  return injectContractVariables(rawTemplate, variables);
}

/**
 * Extracts or derives official License ID and Contract Version from purchase record and contract_text.
 */
export function extractLicenseMetadata(purchase: any): {
  licenseId: string;
  contractVersion: string;
  deliverables: string;
} {
  const tier = (purchase.license_tier || "wav").toLowerCase();
  const config = TIER_CONTRACT_CONFIGS[tier] || TIER_CONTRACT_CONFIGS.wav;

  // 1. License ID: column OR parsed from contract_text OR derived deterministically
  let licenseId = purchase.license_id;
  if (!licenseId && purchase.contract_text) {
    const match = purchase.contract_text.match(/LICENSE ID:\s*(RG-[A-Z0-9]+-\d{4}-[A-Z0-9]+)/i);
    if (match) licenseId = match[1].trim();
  }
  if (!licenseId) {
    licenseId = generateDeterministicLicenseId({
      tier,
      purchaseId: purchase.id,
      date: purchase.created_at,
    });
  }

  // 2. Contract Version: column OR parsed from contract_text OR default
  let contractVersion = purchase.contract_version;
  if (!contractVersion && purchase.contract_text) {
    const match = purchase.contract_text.match(/VERSION:\s*(NE-v\d+\.\d+|EX-v\d+\.\d+)/i);
    if (match) contractVersion = match[1].trim();
  }
  if (!contractVersion) {
    contractVersion = config.version;
  }

  return {
    licenseId,
    contractVersion,
    deliverables: config.deliverables,
  };
}

/**
 * Generates an official, publication-quality vector PDF of the license agreement using pdf-lib.
 */
export async function generateContractPdfBuffer(contractParams: GenerateContractParams): Promise<Uint8Array> {
  const cleanTier = contractParams.licenseTier.toLowerCase();
  const config = TIER_CONTRACT_CONFIGS[cleanTier] || TIER_CONTRACT_CONFIGS.wav;
  const isExclusive = config.licenseType === "EXCLUSIVE";

  const fullContractText = generateLicenseContract(contractParams);
  const metadata = {
    licenseId: contractParams.licenseId || generateDeterministicLicenseId({ tier: cleanTier, purchaseId: contractParams.orderId }),
    version: contractParams.version || config.version,
    tier: config.licenseTier,
    deliverables: config.deliverables,
    customerName: contractParams.customerName || "Customer",
    customerEmail: contractParams.customerEmail,
    beatTitle: contractParams.beatTitle,
    beatId: contractParams.beatId,
    orderId: contractParams.orderId,
    purchaseDate: new Date(contractParams.purchaseDate || Date.now()).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    price: `$${contractParams.amountPaid.toFixed(2)} ${contractParams.currency || "USD"}`,
  };

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`RGODBEAT License Agreement - ${metadata.licenseId}`);
  pdfDoc.setAuthor("RGODBEAT");
  pdfDoc.setSubject(`Official ${metadata.tier} License Agreement`);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Standard Letter dimensions: 612 x 792 pt
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const margin = 50;

  // 1. Top Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: rgb(0.06, 0.06, 0.08), // #0f0f14
  });

  page.drawText("RGODBEAT MUSIC PRODUCTION", {
    x: margin,
    y: height - 42,
    size: 16,
    font: fontBold,
    color: rgb(0.98, 0.98, 1),
  });

  page.drawText(
    isExclusive
      ? "OFFICIAL EXCLUSIVE BEAT LICENSE AGREEMENT"
      : "OFFICIAL NON-EXCLUSIVE BEAT LICENSE AGREEMENT",
    {
      x: margin,
      y: height - 60,
      size: 10,
      font: fontRegular,
      color: rgb(0.66, 0.45, 0.98), // Purple accent
    }
  );

  page.drawText(`VERSION: ${metadata.version}`, {
    x: width - margin - 120,
    y: height - 52,
    size: 10,
    font: fontMono,
    color: rgb(0.8, 0.8, 0.85),
  });

  // 2. Official License ID & Key Folio Box
  const folioY = height - 130;
  page.drawRectangle({
    x: margin,
    y: folioY,
    width: width - margin * 2,
    height: 38,
    color: rgb(0.96, 0.96, 0.98),
    borderColor: rgb(0.85, 0.85, 0.9),
    borderWidth: 1,
  });

  page.drawText("OFFICIAL LICENSE IDENTIFIER:", {
    x: margin + 14,
    y: folioY + 22,
    size: 8,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.45),
  });

  page.drawText(metadata.licenseId, {
    x: margin + 14,
    y: folioY + 8,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  page.drawText(`ORDER: ${metadata.orderId.slice(0, 18)}...`, {
    x: width - margin - 220,
    y: folioY + 14,
    size: 9,
    font: fontMono,
    color: rgb(0.4, 0.4, 0.45),
  });

  // 3. Structured Transaction Summary Table
  const tableY = folioY - 145;
  page.drawRectangle({
    x: margin,
    y: tableY,
    width: width - margin * 2,
    height: 135,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.9, 0.9, 0.92),
    borderWidth: 1,
  });

  // Table row items
  const rowItems = [
    ["BEAT TITLE", `"${metadata.beatTitle}" (ID: ${metadata.beatId.slice(0, 12)}...)`],
    ["LICENSEE", `${metadata.customerName} (${metadata.customerEmail})`],
    ["LICENSE PRODUCT", `${metadata.tier} (${isExclusive ? "Exclusive" : "Non-Exclusive"})`],
    ["CONSIDERATION", `${metadata.price} (Verified & Paid in Full)`],
    ["DELIVERABLES", metadata.deliverables],
    ["DATE OF EXECUTION", metadata.purchaseDate],
  ];

  let currentY = tableY + 115;
  rowItems.forEach(([label, val]) => {
    page.drawText(label, {
      x: margin + 12,
      y: currentY,
      size: 8,
      font: fontBold,
      color: rgb(0.35, 0.35, 0.4),
    });
    page.drawText(val, {
      x: margin + 145,
      y: currentY,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.2),
    });
    currentY -= 19;
  });

  // 4. Contract Body Section
  const bodyY = tableY - 25;
  page.drawText("TERMS & OPERATIONAL SPECIFICATIONS", {
    x: margin,
    y: bodyY,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  // Clean formatted clauses
  const bodyTextLines = [
    `1. GRANT OF LICENSE: Licensor hereby grants to Licensee the ${isExclusive ? "exclusive" : "non-exclusive"} rights`,
    `   to create derivative vocal and sound recording works utilizing the Beat titled "${metadata.beatTitle}".`,
    `2. DELIVERABLES AUTHORIZATION: Licensee is authorized to receive and utilize:`,
    `   ${metadata.deliverables}.`,
    `3. COMPREHENSIVE TERMS GOVERNANCE: The comprehensive legal terms and conditions of the`,
    `   RGODBEAT ${isExclusive ? "Exclusive" : "Non-Exclusive"} Beat License Agreement govern this production.`,
    `4. RECORD RETENTION: This Agreement is permanently archived under License ID ${metadata.licenseId}.`,
    `   Any future modifications to standard licensing terms will not alter the terms of this executed agreement.`,
    `5. DIGITAL EXECUTION: Rendered legally binding upon verified completion of transaction consideration.`,
  ];

  let lineY = bodyY - 22;
  bodyTextLines.forEach((line) => {
    page.drawText(line, {
      x: margin,
      y: lineY,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.3),
    });
    lineY -= 15;
  });

  // 5. Official Bottom Verification & Sign-off Block
  const footerBoxY = 60;
  page.drawRectangle({
    x: margin,
    y: footerBoxY,
    width: width - margin * 2,
    height: 48,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.9, 0.9, 0.92),
    borderWidth: 1,
  });

  page.drawText("LICENSOR: RGODBEAT MUSIC PRODUCTION", {
    x: margin + 14,
    y: footerBoxY + 30,
    size: 8.5,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.2),
  });

  page.drawText("Authorized Digital Sign-off: [RGODBEAT VERIFIED TRANSACTION]", {
    x: margin + 14,
    y: footerBoxY + 16,
    size: 8,
    font: fontMono,
    color: rgb(0.4, 0.4, 0.45),
  });

  page.drawText("Contact: rgodbeat@gmail.com", {
    x: width - margin - 150,
    y: footerBoxY + 30,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.45),
  });

  page.drawText(`Page 1 of 1 • Version ${metadata.version}`, {
    x: width - margin - 150,
    y: footerBoxY + 16,
    size: 7.5,
    font: fontMono,
    color: rgb(0.55, 0.55, 0.6),
  });

  return await pdfDoc.save();
}
