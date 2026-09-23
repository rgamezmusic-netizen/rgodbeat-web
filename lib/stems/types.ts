/**
 * RGODBEAT 2.0 — Stem Request System Types
 */

export const STEM_TICKET_STATUSES = ["Pending", "Contacted", "Delivered", "Closed"] as const;
export type StemTicketStatus = (typeof STEM_TICKET_STATUSES)[number];

export const EXPECTED_STEM_GROUPS = [
  "01_MELODIES",
  "02_DRUMS",
  "03_BASS",
  "04_FX",
] as const;

export type ExpectedStemGroup = (typeof EXPECTED_STEM_GROUPS)[number];

export const STEM_GROUP_FILE_NAMES: Record<ExpectedStemGroup, string> = {
  "01_MELODIES": "01_MELODIES.wav",
  "02_DRUMS": "02_DRUMS.wav",
  "03_BASS": "03_BASS.wav",
  "04_FX": "04_FX.wav",
};

export interface StemFileEntry {
  fileName: string; // e.g. "01_MELODIES.wav"
  storagePath: string; // e.g. "stems/RG-STEM-2026-000001/01_MELODIES.wav"
  downloadUrl?: string; // external or direct URL if applicable
  sizeBytes?: number;
  uploadedAt: string;
}

export type StemFilesCollection = Partial<Record<ExpectedStemGroup, StemFileEntry>>;

export interface StemRequestTicket {
  id: string; // UUID
  ticketId: string; // e.g. "RG-STEM-2026-000001"
  purchaseId: string;
  customerId?: string | null;
  customerName: string;
  customerEmail: string;
  beatId?: string | null;
  beatTitle: string;
  licenseId: string;
  licenseTier: "unlimited" | "exclusive";
  orderId?: string | null;
  contractVersion: string;
  status: StemTicketStatus;
  adminNotes: string;
  stemFiles: StemFilesCollection;
  createdAt: string;
  updatedAt: string;
}
