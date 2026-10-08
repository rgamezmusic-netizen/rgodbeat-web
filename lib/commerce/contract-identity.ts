import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLegalName } from '@/lib/account/legal-name';

/** Never use the downloading admin or gift payer's profile as the licensee. */
export async function resolveContractCustomerName(
  admin: SupabaseClient,
  customer: { authUserId?: string | null; email: string; fallbackName?: string | null },
): Promise<string> {
  const fallback = customer.fallbackName || 'Customer';
  if (!customer.authUserId) return fallback;
  const { data, error } = await admin.auth.admin.getUserById(customer.authUserId);
  if (error?.status === 404 || error?.code === 'user_not_found') return fallback;
  if (error) throw new Error('CONTRACT_IDENTITY_UNAVAILABLE');
  const user = data.user;
  if (!user?.email || !(user.email_confirmed_at || user.confirmed_at)
    || user.email.trim().toLowerCase() !== customer.email.trim().toLowerCase()) return fallback;
  return getLegalName(user) || fallback;
}
