/**
 * RGODBEAT 2.0 - Commerce Type Definitions
 */

import { LicenseTier, Beat } from "@/types";

export type OrderStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";
export type PurchaseStatus = "active" | "revoked" | "refunded";
export type CommercialFileType = "mp3" | "wav" | "stems" | "exclusive" | "contract";

export interface Customer {
  id: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  beatId: string;
  licenseTypeId: string;
  unitPrice: number;
  currency: string;
  createdAt: string;
  beat?: Beat;
  licenseName?: string;
  licenseTier?: LicenseTier;
}

export interface Order {
  id: string;
  customerId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  subtotalAmount: number;
  totalAmount: number;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  customer?: Customer;
}

export interface PurchaseEntitlement {
  id: string;
  orderId: string;
  orderItemId: string;
  customerId: string;
  beatId: string;
  licenseTypeId: string;
  licenseTier: LicenseTier;
  contractText: string | null;
  status: PurchaseStatus;
  createdAt: string;
  beat?: Beat;
}

export interface DownloadRecord {
  id: string;
  purchaseId: string;
  fileType: CommercialFileType;
  storagePath: string;
  ipAddress: string | null;
  userAgent: string | null;
  downloadedAt: string;
}

export interface CheckoutItemPayload {
  beatId: string;
  licenseTier: LicenseTier;
}

export interface CheckoutPayload {
  items: CheckoutItemPayload[];
  customerEmail?: string;
  customerName?: string;
  embedded?: boolean;
}

export interface CheckoutResponse {
  sessionId: string;
  url: string | null;
  clientSecret?: string | null;
  totalAmount: number;
}
