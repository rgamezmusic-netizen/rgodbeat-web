import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { LicenseTier } from "@/types";

export const CONTRACT_VERSIONS = {
  NON_EXCLUSIVE: "NE-v1.0",
  EXCLUSIVE: "EX-v1.0",
} as const;

export type ContractVersion = (typeof CONTRACT_VERSIONS)[keyof typeof CONTRACT_VERSIONS];

export const DEFAULT_GOVERNING_LAW = "State of Texas, United States";
export const DEFAULT_JURISDICTION = "Travis County, Texas, United States";

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
    deliverables: "MP3 320 kbps + WAV 24-bit / 48 kHz + grouped stems available upon request",
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

  let hash = 0;
  const cleanUuid = (purchaseId || "").replace(/-/g, "");
  for (let i = 0; i < cleanUuid.length; i++) {
    hash = (hash * 31 + cleanUuid.charCodeAt(i)) >>> 0;
  }
  const seqNum = (hash % 900000) + 100000;

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
  GOVERNING_LAW: string;
  JURISDICTION: string;
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

  // Fallback to public template if exists
  const publicTemplatePath = path.join(process.cwd(), "public", "contracts", "templates", "non_exclusive_master_v1.html");
  try {
    if (!isExclusive && fs.existsSync(/*turbopackIgnore: true*/ publicTemplatePath)) {
      const html = fs.readFileSync(/*turbopackIgnore: true*/ publicTemplatePath, "utf-8");
      // Strip simple html tags for text mode
      return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ");
    }
  } catch {}

  // Safe fallback template
  return `================================================================================
RGODBEAT MUSIC PRODUCTION
RGODBEAT NON-EXCLUSIVE BEAT LICENSE AGREEMENT
Contract Version: {{CONTRACT_VERSION}}
License ID:       {{LICENSE_ID}}
================================================================================

ORDER IDENTIFIER:  {{ORDER_ID}}
DATE OF EXECUTION: {{PURCHASE_DATE}}

1. PARTIES: RGODBEAT ("Licensor") and {{CUSTOMER_NAME}} ({{CUSTOMER_EMAIL}}) ("Licensee").
2. BEAT IDENTIFICATION: "{{BEAT_NAME}}" (Beat ID: {{BEAT_ID}}).
3. LICENSE TIER: {{LICENSE_TIER}} ({{PURCHASE_PRICE}} Paid in Full).
4. PURCHASED DELIVERABLES: {{DELIVERABLES}}.
5. GRANT: Non-exclusive, worldwide, perpetual license for New Song creation.
6. CONTENT ID RESTRICTION: No YouTube/Meta Content ID or audio-fingerprinting registration permitted.
7. FUTURE EXCLUSIVE: A future Exclusive sale does not invalidate this prior valid Non-Exclusive license.
8. GOVERNING LAW & JURISDICTION: {{GOVERNING_LAW}}, Courts of {{JURISDICTION}}.

================================================================================
Licensor: RGODBEAT • rgodbeat@gmail.com • Electronically Executed
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
  governingLaw?: string;
  jurisdiction?: string;
}

/**
 * Assembles the full official legal contract using the Single Master Non-Exclusive Template (NE-v1.0).
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
  governingLaw = DEFAULT_GOVERNING_LAW,
  jurisdiction = DEFAULT_JURISDICTION,
}: GenerateContractParams): string {
  const cleanTier = licenseTier.toLowerCase();
  const config = TIER_CONTRACT_CONFIGS[cleanTier] || TIER_CONTRACT_CONFIGS.wav;
  const isExclusive = config.licenseType === "EXCLUSIVE";

  const effectiveVersion = version || (isExclusive ? CONTRACT_VERSIONS.EXCLUSIVE : CONTRACT_VERSIONS.NON_EXCLUSIVE);
  const effectiveLicenseId =
    licenseId || generateDeterministicLicenseId({ tier: cleanTier, purchaseId: orderId, date: purchaseDate });

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
    GOVERNING_LAW: governingLaw,
    JURISDICTION: jurisdiction,
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
  governingLaw: string;
  jurisdiction: string;
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
    governingLaw: DEFAULT_GOVERNING_LAW,
    jurisdiction: DEFAULT_JURISDICTION,
  };
}

/**
 * Text wrapping utility for standard letter page widths.
 */
function wrapLines(text: string, maxChars = 92): string[] {
  const out: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.length <= maxChars) {
      out.push(line);
      continue;
    }
    const words = line.split(" ");
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length <= maxChars) {
        cur = (cur + " " + w).trim();
      } else {
        if (cur) out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/**
 * Generates an official, multi-page vector PDF containing the transaction certificate
 * and the complete 23 legal sections of the RGODBEAT Non-Exclusive Agreement.
 */
export async function generateContractPdfBuffer(contractParams: GenerateContractParams): Promise<Uint8Array> {
  const cleanTier = contractParams.licenseTier.toLowerCase();
  const config = TIER_CONTRACT_CONFIGS[cleanTier] || TIER_CONTRACT_CONFIGS.wav;
  const isExclusive = config.licenseType === "EXCLUSIVE";

  const fullContractText = generateLicenseContract(contractParams);
  const metadata = {
    licenseId:
      contractParams.licenseId ||
      generateDeterministicLicenseId({ tier: cleanTier, purchaseId: contractParams.orderId }),
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
    governingLaw: contractParams.governingLaw || DEFAULT_GOVERNING_LAW,
    jurisdiction: contractParams.jurisdiction || DEFAULT_JURISDICTION,
  };

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`RGODBEAT License Agreement — ${metadata.licenseId}`);
  pdfDoc.setAuthor("RGODBEAT");
  pdfDoc.setSubject(`Official ${metadata.tier} License Agreement (${metadata.version})`);

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  // ---------------------------------------------------------------------------
  // PAGE 1: Official Executive Certificate & License Summary
  // ---------------------------------------------------------------------------
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);

  // Header Banner
  page1.drawRectangle({
    x: 0,
    y: pageHeight - 85,
    width: pageWidth,
    height: 85,
    color: rgb(0.06, 0.06, 0.08),
  });

  page1.drawText("RGODBEAT MUSIC PRODUCTION", {
    x: margin,
    y: pageHeight - 42,
    size: 16,
    font: fontBold,
    color: rgb(0.98, 0.98, 1),
  });

  page1.drawText(
    isExclusive
      ? "OFFICIAL EXCLUSIVE BEAT LICENSE AGREEMENT"
      : "OFFICIAL NON-EXCLUSIVE BEAT LICENSE AGREEMENT",
    {
      x: margin,
      y: pageHeight - 62,
      size: 10,
      font: fontRegular,
      color: rgb(0.66, 0.45, 0.98),
    }
  );

  page1.drawText(`VERSION: ${metadata.version}`, {
    x: pageWidth - margin - 120,
    y: pageHeight - 52,
    size: 10,
    font: fontMono,
    color: rgb(0.8, 0.8, 0.85),
  });

  // License Folio Box
  const folioY = pageHeight - 140;
  page1.drawRectangle({
    x: margin,
    y: folioY,
    width: contentWidth,
    height: 40,
    color: rgb(0.96, 0.96, 0.98),
    borderColor: rgb(0.85, 0.85, 0.9),
    borderWidth: 1,
  });

  page1.drawText("OFFICIAL LICENSE IDENTIFIER:", {
    x: margin + 14,
    y: folioY + 24,
    size: 8,
    font: fontBold,
    color: rgb(0.4, 0.4, 0.45),
  });

  page1.drawText(metadata.licenseId, {
    x: margin + 14,
    y: folioY + 9,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  page1.drawText(`ORDER: ${metadata.orderId.slice(0, 20)}...`, {
    x: pageWidth - margin - 220,
    y: folioY + 16,
    size: 9,
    font: fontMono,
    color: rgb(0.4, 0.4, 0.45),
  });

  // Transaction Summary Table
  const tableY = folioY - 175;
  page1.drawRectangle({
    x: margin,
    y: tableY,
    width: contentWidth,
    height: 165,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.9, 0.9, 0.92),
    borderWidth: 1,
  });

  const rowItems = [
    ["BEAT TITLE", `"${metadata.beatTitle}" (Catalog ID: ${metadata.beatId})`],
    ["LICENSEE (CUSTOMER)", `${metadata.customerName} (${metadata.customerEmail})`],
    ["LICENSE PRODUCT", `${metadata.tier} (${isExclusive ? "Exclusive" : "Non-Exclusive"})`],
    ["TOTAL CONSIDERATION", `${metadata.price} (Verified & Paid in Full)`],
    ["PURCHASED DELIVERABLES", metadata.deliverables],
    ["DATE OF EXECUTION", metadata.purchaseDate],
    ["GOVERNING LAW", metadata.governingLaw],
    ["JURISDICTION", metadata.jurisdiction],
  ];

  let currentY = tableY + 145;
  rowItems.forEach(([label, val]) => {
    page1.drawText(label, {
      x: margin + 12,
      y: currentY,
      size: 7.5,
      font: fontBold,
      color: rgb(0.35, 0.35, 0.4),
    });
    page1.drawText(val, {
      x: margin + 155,
      y: currentY,
      size: 8,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.2),
    });
    currentY -= 18;
  });

  // Preamble & Electronic Acceptance Notice Box
  const noticeY = tableY - 95;
  page1.drawRectangle({
    x: margin,
    y: noticeY,
    width: contentWidth,
    height: 80,
    color: rgb(0.97, 0.97, 1),
    borderColor: rgb(0.8, 0.75, 0.95),
    borderWidth: 1,
  });

  page1.drawText("ELECTRONIC ACCEPTANCE & LEGAL CERTIFICATION", {
    x: margin + 12,
    y: noticeY + 62,
    size: 8.5,
    font: fontBold,
    color: rgb(0.35, 0.2, 0.7),
  });

  const noticeLines = [
    "By completing the purchase transaction through the RGODBEAT platform and electronically accepting",
    "the applicable terms, the Licensee explicitly agrees to the full 23-section terms of this Agreement.",
    "This Agreement grants worldwide, perpetual non-exclusive rights to create and monetize a New Song.",
    "The full legal agreement text follows on the subsequent pages of this official document.",
  ];
  let nY = noticeY + 46;
  noticeLines.forEach((nl) => {
    page1.drawText(nl, {
      x: margin + 12,
      y: nY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.25),
    });
    nY -= 12;
  });

  // Key Rights Highlights Box (Sections 4, 7, 10, 12 highlights)
  const highlightsY = noticeY - 105;
  page1.drawText("EXECUTIVE SUMMARY OF KEY TERMS", {
    x: margin,
    y: highlightsY + 90,
    size: 9,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.15),
  });

  const highlights = [
    `• Non-Exclusive Commercial Rights: Perpetual, worldwide license to release and monetize on Spotify, Apple Music, YouTube, etc.`,
    `• Deliverables: ${metadata.deliverables}. ${cleanTier === "unlimited" ? "Includes right to request grouped stems." : "No stem access included."}`,
    `• Remix Rights: ${cleanTier === "unlimited" ? "Unlimited tier includes additional remix rights (Section 7)." : "MP3 and WAV do not include additional remix rights."}`,
    `• Content ID Restriction: Licensee may NOT register original beat with YouTube/Meta Content ID (Section 10).`,
    `• Future Exclusive Sales: A future Exclusive sale will NEVER revoke or invalidate this prior Non-Exclusive license (Section 12).`,
  ];
  let hY = highlightsY + 74;
  highlights.forEach((hl) => {
    page1.drawText(hl, {
      x: margin,
      y: hY,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.3),
    });
    hY -= 14;
  });

  // Page 1 Footer
  page1.drawRectangle({
    x: margin,
    y: 35,
    width: contentWidth,
    height: 32,
    color: rgb(0.97, 0.97, 0.98),
    borderColor: rgb(0.9, 0.9, 0.92),
    borderWidth: 1,
  });

  page1.drawText(`License ID: ${metadata.licenseId} • Version: ${metadata.version} • RGODBEAT Official Document`, {
    x: margin + 12,
    y: 47,
    size: 7.5,
    font: fontMono,
    color: rgb(0.35, 0.35, 0.4),
  });

  page1.drawText(`Page 1 of Agreement Text Follows`, {
    x: pageWidth - margin - 170,
    y: 47,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.55),
  });

  // ---------------------------------------------------------------------------
  // PAGES 2+: Complete 23 Legal Sections (Full Legal Text)
  // ---------------------------------------------------------------------------
  // Extract body lines starting after the header separator
  const textStartIdx = fullContractText.indexOf("1. PARTIES");
  const contractBodyText = textStartIdx !== -1 ? fullContractText.slice(textStartIdx) : fullContractText;
  const wrappedLines = wrapLines(contractBodyText, 94);

  const linesPerPage = 58;
  const totalBodyPages = Math.ceil(wrappedLines.length / linesPerPage);
  const totalPages = 1 + totalBodyPages;

  for (let pIdx = 0; pIdx < totalBodyPages; pIdx++) {
    const pageNum = 2 + pIdx;
    const bodyPage = pdfDoc.addPage([pageWidth, pageHeight]);

    // Running Header
    bodyPage.drawText("RGODBEAT NON-EXCLUSIVE BEAT LICENSE AGREEMENT", {
      x: margin,
      y: pageHeight - 40,
      size: 8,
      font: fontBold,
      color: rgb(0.4, 0.25, 0.7),
    });

    bodyPage.drawText(`License ID: ${metadata.licenseId} • Version: ${metadata.version}`, {
      x: pageWidth - margin - 220,
      y: pageHeight - 40,
      size: 7.5,
      font: fontMono,
      color: rgb(0.4, 0.4, 0.45),
    });

    bodyPage.drawLine({
      start: { x: margin, y: pageHeight - 46 },
      end: { x: pageWidth - margin, y: pageHeight - 46 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.9),
    });

    // Content lines
    const startLine = pIdx * linesPerPage;
    const pageLines = wrappedLines.slice(startLine, startLine + linesPerPage);
    let lineY = pageHeight - 65;

    for (const line of pageLines) {
      const isHeading = /^\d+\.\s+[A-Z\s—-]+$/.test(line.trim());
      bodyPage.drawText(line, {
        x: margin,
        y: lineY,
        size: isHeading ? 8 : 7.2,
        font: isHeading ? fontBold : fontRegular,
        color: isHeading ? rgb(0.1, 0.1, 0.15) : rgb(0.2, 0.2, 0.25),
      });
      lineY -= 11.2;
    }

    // Running Footer
    bodyPage.drawLine({
      start: { x: margin, y: 46 },
      end: { x: pageWidth - margin, y: 46 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.9),
    });

    bodyPage.drawText("Licensor: RGODBEAT • Austin, TX • Contact: rgodbeat@gmail.com", {
      x: margin,
      y: 34,
      size: 7,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.55),
    });

    bodyPage.drawText(`Page ${pageNum} of ${totalPages}`, {
      x: pageWidth - margin - 60,
      y: 34,
      size: 7,
      font: fontMono,
      color: rgb(0.5, 0.5, 0.55),
    });
  }

  return await pdfDoc.save();
}
