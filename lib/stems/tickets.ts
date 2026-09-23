import fs from "fs";
import path from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractLicenseMetadata } from "@/lib/commerce/contracts";
import {
  StemRequestTicket,
  StemTicketStatus,
  STEM_TICKET_STATUSES,
  ExpectedStemGroup,
  EXPECTED_STEM_GROUPS,
  STEM_GROUP_FILE_NAMES,
  StemFileEntry,
  StemFilesCollection,
} from "./types";

/**
 * Validates whether a license tier is eligible for Stem Requests.
 * Strictly UNLIMITED and EXCLUSIVE only.
 */
export function isTierEligibleForStems(tier: string | null | undefined): boolean {
  if (!tier) return false;
  const clean = tier.trim().toLowerCase();
  return clean === "unlimited" || clean === "exclusive";
}

/**
 * Generates an official human-readable Stem Ticket ID.
 * Format: RG-STEM-YYYY-XXXXXX (e.g. RG-STEM-2026-000001)
 */
export function formatStemTicketId(
  year: number | string = new Date().getFullYear(),
  seq: number | string = 1
): string {
  const formattedSeq =
    typeof seq === "number"
      ? String(seq).padStart(6, "0")
      : String(seq).replace(/\D/g, "").padStart(6, "0").slice(-6);

  return `RG-STEM-${year}-${formattedSeq}`;
}

/**
 * Deterministically generates a collision-free Ticket ID from a purchase ID.
 */
export function generateDeterministicStemTicketId(
  purchaseId: string,
  date: string | Date | number = new Date()
): string {
  let year: number;
  if (typeof date === "number") {
    year = date;
  } else {
    const d = typeof date === "string" ? new Date(date) : date;
    year = isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear();
  }

  let hash = 0;
  const cleanUuid = (purchaseId || "").replace(/-/g, "");
  for (let i = 0; i < cleanUuid.length; i++) {
    hash = (hash * 33 + cleanUuid.charCodeAt(i)) >>> 0;
  }
  const seqNum = (hash % 900000) + 100000;

  return formatStemTicketId(year, seqNum);
}

// ---------------------------------------------------------------------------
// Fallback Local Storage Helper (for local testing & dev resilience)
// ---------------------------------------------------------------------------
const LOCAL_CACHE_DIR = path.join(process.cwd(), "data");
const LOCAL_CACHE_FILE = path.join(LOCAL_CACHE_DIR, "stem_requests_cache.json");

function readLocalCache(): Record<string, StemRequestTicket> {
  try {
    if (fs.existsSync(LOCAL_CACHE_FILE)) {
      const content = fs.readFileSync(LOCAL_CACHE_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch {}
  return {};
}

function writeLocalCache(data: Record<string, StemRequestTicket>) {
  try {
    if (!fs.existsSync(LOCAL_CACHE_DIR)) {
      fs.mkdirSync(LOCAL_CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

function rowToTicket(row: any): StemRequestTicket {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    purchaseId: row.purchase_id,
    customerId: row.customer_id || null,
    customerName: row.customer_name || "Customer",
    customerEmail: row.customer_email,
    beatId: row.beat_id || null,
    beatTitle: row.beat_title,
    licenseId: row.license_id,
    licenseTier: (row.license_tier || "unlimited").toLowerCase() as "unlimited" | "exclusive",
    orderId: row.order_id || null,
    contractVersion: row.contract_version,
    status: (row.status || "Pending") as StemTicketStatus,
    adminNotes: row.admin_notes || "",
    stemFiles: (row.stem_files || {}) as StemFilesCollection,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public Service API
// ---------------------------------------------------------------------------

/**
 * Creates an official Stem Request Ticket for an eligible UNLIMITED or EXCLUSIVE purchase.
 */
export async function createStemRequest(purchaseId: string): Promise<StemRequestTicket> {
  const supabase = createAdminClient();

  // 1. Fetch purchase record and verify existence & eligibility
  const { data: purchase, error: pErr } = await supabase
    .from("purchases")
    .select(`
      id,
      customer_id,
      beat_id,
      license_tier,
      status,
      created_at,
      contract_text,
      order_id,
      orders (
        id,
        created_at
      ),
      customers (
        id,
        name,
        email
      ),
      beats (
        id,
        title
      )
    `)
    .eq("id", purchaseId)
    .single();

  if (pErr || !purchase) {
    throw new Error(`Purchase record not found for ID: ${purchaseId}`);
  }

  const tier = (purchase.license_tier || "").toLowerCase();
  if (!isTierEligibleForStems(tier)) {
    throw new Error(
      `Eligibility Restriction: Stem Requests are only available for UNLIMITED and EXCLUSIVE licenses. Your purchased tier (${tier.toUpperCase()}) does not include stems.`
    );
  }

  // 2. Check if a ticket already exists for this purchase
  const existing = await getStemRequestByPurchase(purchaseId);
  if (existing) {
    return existing;
  }

  // 3. Extract license metadata and generate Ticket ID
  const licenseMeta = extractLicenseMetadata(purchase);
  const now = new Date();
  const ticketId = generateDeterministicStemTicketId(purchase.id, purchase.created_at || now);

  const customerName = (purchase.customers as any)?.name || "Customer";
  const customerEmail = (purchase.customers as any)?.email || "rgodbeat@gmail.com";
  const beatTitle = (purchase.beats as any)?.title || "Licensed Beat";
  const orderId = (purchase.orders as any)?.id || purchase.order_id || `ord_${purchase.id.slice(0, 8)}`;

  const ticketData: StemRequestTicket = {
    id: purchase.id, // Or crypto.randomUUID()
    ticketId,
    purchaseId: purchase.id,
    customerId: purchase.customer_id || null,
    customerName,
    customerEmail,
    beatId: purchase.beat_id || null,
    beatTitle,
    licenseId: licenseMeta.licenseId,
    licenseTier: tier as "unlimited" | "exclusive",
    orderId,
    contractVersion: licenseMeta.contractVersion,
    status: "Pending",
    adminNotes: "",
    stemFiles: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // 4. Try persisting to Supabase table
  try {
    const { data: inserted, error: insertErr } = await supabase
      .from("stem_requests")
      .insert({
        ticket_id: ticketData.ticketId,
        purchase_id: ticketData.purchaseId,
        customer_id: ticketData.customerId,
        customer_name: ticketData.customerName,
        customer_email: ticketData.customerEmail,
        beat_id: ticketData.beatId,
        beat_title: ticketData.beatTitle,
        license_id: ticketData.licenseId,
        license_tier: ticketData.licenseTier,
        order_id: ticketData.orderId,
        contract_version: ticketData.contractVersion,
        status: "Pending",
        admin_notes: "",
        stem_files: {},
      })
      .select()
      .single();

    if (!insertErr && inserted) {
      return rowToTicket(inserted);
    }
  } catch {}

  // Fallback to local cache if table is pending schema migration
  const cache = readLocalCache();
  cache[ticketId] = ticketData;
  cache[`by_purchase_${purchaseId}`] = ticketData;
  writeLocalCache(cache);

  return ticketData;
}

/**
 * Fetches a Stem Request by purchase UUID.
 */
export async function getStemRequestByPurchase(purchaseId: string): Promise<StemRequestTicket | null> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("stem_requests")
      .select("*")
      .eq("purchase_id", purchaseId)
      .maybeSingle();

    if (!error && data) {
      return rowToTicket(data);
    }
  } catch {}

  const cache = readLocalCache();
  if (cache[`by_purchase_${purchaseId}`]) {
    return cache[`by_purchase_${purchaseId}`];
  }

  // Scan cache
  for (const item of Object.values(cache)) {
    if (item.purchaseId === purchaseId) {
      return item;
    }
  }

  return null;
}

/**
 * Fetches a Stem Request by Ticket ID (RG-STEM-YYYY-XXXXXX).
 */
export async function getStemRequestByTicketId(ticketId: string): Promise<StemRequestTicket | null> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("stem_requests")
      .select("*")
      .eq("ticket_id", ticketId)
      .maybeSingle();

    if (!error && data) {
      return rowToTicket(data);
    }
  } catch {}

  const cache = readLocalCache();
  return cache[ticketId] || null;
}

/**
 * Lists all Stem Requests for a specific customer email.
 */
export async function listStemRequestsForCustomer(customerEmail: string): Promise<StemRequestTicket[]> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("stem_requests")
      .select("*")
      .eq("customer_email", customerEmail)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data.map(rowToTicket);
    }
  } catch {}

  const cache = readLocalCache();
  return Object.values(cache)
    .filter((t, idx, arr) => arr.findIndex((x) => x.ticketId === t.ticketId) === idx)
    .filter((t) => t.customerEmail?.toLowerCase() === customerEmail.toLowerCase())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Lists all Stem Requests for Admin view.
 */
export async function listAllStemRequests(): Promise<StemRequestTicket[]> {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("stem_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data.map(rowToTicket);
    }
  } catch {}

  const cache = readLocalCache();
  return Object.values(cache)
    .filter((t, idx, arr) => arr.findIndex((x) => x.ticketId === t.ticketId) === idx)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Updates status and/or admin notes for a stem ticket.
 */
export async function updateStemRequestStatus(
  ticketId: string,
  status: StemTicketStatus,
  adminNotes?: string
): Promise<StemRequestTicket> {
  if (!STEM_TICKET_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}. Must be one of: ${STEM_TICKET_STATUSES.join(", ")}`);
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  try {
    const updatePayload: any = {
      status,
      updated_at: now,
    };
    if (adminNotes !== undefined) {
      updatePayload.admin_notes = adminNotes;
    }

    const { data, error } = await supabase
      .from("stem_requests")
      .update(updatePayload)
      .eq("ticket_id", ticketId)
      .select()
      .single();

    if (!error && data) {
      return rowToTicket(data);
    }
  } catch {}

  // Fallback cache update
  const cache = readLocalCache();
  const existing = cache[ticketId];
  if (!existing) {
    throw new Error(`Stem request not found: ${ticketId}`);
  }

  existing.status = status;
  if (adminNotes !== undefined) {
    existing.adminNotes = adminNotes;
  }
  existing.updatedAt = now;
  cache[ticketId] = existing;
  cache[`by_purchase_${existing.purchaseId}`] = existing;
  writeLocalCache(cache);

  return existing;
}

/**
 * Attaches a grouped stem file entry (e.g. 01_MELODIES, 02_DRUMS, etc.) to the ticket.
 */
export async function attachStemFile(
  ticketId: string,
  groupKey: ExpectedStemGroup,
  fileEntry: StemFileEntry
): Promise<StemRequestTicket> {
  if (!EXPECTED_STEM_GROUPS.includes(groupKey)) {
    throw new Error(`Invalid stem group: ${groupKey}`);
  }

  const current = await getStemRequestByTicketId(ticketId);
  if (!current) {
    throw new Error(`Stem request not found: ${ticketId}`);
  }

  const updatedFiles: StemFilesCollection = {
    ...current.stemFiles,
    [groupKey]: {
      ...fileEntry,
      fileName: fileEntry.fileName || STEM_GROUP_FILE_NAMES[groupKey],
      uploadedAt: fileEntry.uploadedAt || new Date().toISOString(),
    },
  };

  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase
      .from("stem_requests")
      .update({
        stem_files: updatedFiles as any,
        updated_at: new Date().toISOString(),
      })
      .eq("ticket_id", ticketId)
      .select()
      .single();

    if (!error && data) {
      return rowToTicket(data);
    }
  } catch {}

  current.stemFiles = updatedFiles;
  current.updatedAt = new Date().toISOString();

  const cache = readLocalCache();
  cache[ticketId] = current;
  cache[`by_purchase_${current.purchaseId}`] = current;
  writeLocalCache(cache);

  return current;
}
