import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isSiteAdmin } from "@/lib/auth/admin";

export function hasVerifiedEmail(user: User | null | undefined): user is User & { email: string } {
  return Boolean(user?.email && (user.email_confirmed_at || user.confirmed_at));
}

export function guestPurchaseCookieName(orderId: string): string {
  const tag = createHash("sha256").update(`rgodbeat-guest-purchase:v1:${orderId}`).digest("hex");
  return `rg_purchase_${tag}`;
}

export function guestPurchaseTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Resolve verified account identity to its real commercial customer; never equate their UUIDs. */
export async function linkVerifiedCommerceCustomer(
  supabase: SupabaseClient<Database>,
  user: User | null | undefined
): Promise<string | null> {
  if (!hasVerifiedEmail(user)) return null;
  const { data, error } = await (supabase as SupabaseClient<any>).rpc("rg_commerce_link_verified_customer", { p_user_id: user.id });
  if (error || typeof data !== "string") return null;
  return data;
}

export type ProtectedPurchase = {
  id: string;
  order_id: string;
  order_item_id: string;
  customer_id: string;
  beat_id: string;
  license_tier: string;
  status: string;
  contract_text: string | null;
  license_id?: string | null;
  contract_version?: string | null;
  created_at: string;
  beats: { title: string } | null;
  customers: { email: string; name: string | null; auth_user_id: string | null } | null;
  orders: { id: string; customer_id: string; status: string; payment_status: string; total_amount: number; currency: string; customers: { email: string; name: string | null } | null };
};

export async function getAuthorizedPurchase(
  supabase: SupabaseClient<Database>,
  purchaseId: string,
  options: { user?: User | null; guestToken?: (orderId: string) => string | null | undefined }
): Promise<ProtectedPurchase | null> {
  const admin = supabase as SupabaseClient<any>;
  const { data, error } = await admin.from("purchases").select(`
    id,order_id,order_item_id,customer_id,beat_id,license_tier,status,contract_text,license_id,contract_version,created_at,
    beats(title),
    customers!inner(id,email,name,auth_user_id),
    orders!inner(id,customer_id,status,payment_status,total_amount,currency,customers(email,name))
  `).eq("id", purchaseId).maybeSingle();
  if (error || !data) return null;
  const purchase = data as unknown as ProtectedPurchase;
  const order = purchase.orders as ProtectedPurchase["orders"] | ProtectedPurchase["orders"][];
  const resolvedOrder = Array.isArray(order) ? order[0] : order;
  if (!resolvedOrder || resolvedOrder.status !== "completed" || resolvedOrder.payment_status !== "paid" || purchase.status !== "active") return null;
  purchase.orders = resolvedOrder;

  const user = options.user;
  if (hasVerifiedEmail(user)) {
    const linkedCustomerId = await linkVerifiedCommerceCustomer(supabase, user);
    if (linkedCustomerId && purchase.customer_id === linkedCustomerId) return purchase;
    // Compatibility for an unlinked historical customer is restricted to a
    // verified Auth email and can never override an explicit different link.
    if (!linkedCustomerId && purchase.customers?.email.trim().toLowerCase() === user.email.trim().toLowerCase()
      && (!purchase.customers.auth_user_id || purchase.customers.auth_user_id === user.id)) return purchase;
    if (isSiteAdmin(user)) return purchase;
  }

  const token = options.guestToken?.(purchase.order_id);
  if (!token || !/^[A-Za-z0-9_-]{43,}$/.test(token)) return null;
  const { data: grant, error: grantError } = await admin.from("purchase_guest_access_tokens")
    .select("id")
    .eq("order_id", purchase.order_id)
    .eq("customer_id", purchase.customer_id)
    .eq("token_hash", guestPurchaseTokenHash(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (grantError || !grant) return null;
  void admin.from("purchase_guest_access_tokens").update({ last_used_at: new Date().toISOString() })
    .eq("id", grant.id).then(() => undefined, () => undefined);
  return purchase;
}

export async function issueGuestPurchaseAccess(
  supabase: SupabaseClient<Database>,
  orderId: string,
  customerId: string
) {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await (supabase as SupabaseClient<any>).rpc("rg_rotate_purchase_guest_access", {
    p_order_id: orderId,
    p_customer_id: customerId,
    p_token_hash: guestPurchaseTokenHash(token),
  });
  if (error || typeof data !== "string") throw new Error("GUEST_PURCHASE_ACCESS_UNAVAILABLE");
  return { name: guestPurchaseCookieName(orderId), token, expiresAt: data };
}
