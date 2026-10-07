import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateTicketPayment, readMarketProduct } from '@/lib/rg/product/catalog';

export type MarketUtility = { passId: string; productKey: string; version: number; benefitKind: 'beat' | 'discount' | 'studio';
  name: string; studioDays: number | null; giftPass: boolean; discountCents: number };

/** Revalidate ownership/reservation and economic terms before any fulfillment side effect. */
export async function validateMarketUtility(db: SupabaseClient, intent: { id: string; buyer_auth_user_id?: string; state: string }, snapshot: {
  utility?: MarketUtility; totalAmountCents?: number; items?: Array<{ licenseTier: string; unitPrice: number; catalogUnitPrice?: number }>;
}) {
  const utility = snapshot.utility;
  if (!utility) throw new Error('MARKET_UTILITY_SNAPSHOT_MISSING');
  const { data: pass, error } = await db.from('rg_beat_passes').select('id,user_id,product_key,product_version,status,reserved_intent_id').eq('id', utility.passId).single();
  if (error || !pass || pass.product_key !== utility.productKey || pass.product_version !== utility.version) throw new Error('MARKET_UTILITY_PASS_MISMATCH');
  const { data: row, error: catalogError } = await db.from('rg_market_products').select('*').eq('product_key', pass.product_key).eq('version', pass.product_version).single();
  if (catalogError || !row) throw new Error('MARKET_UTILITY_CATALOG_MISSING');
  const product = readMarketProduct(row);
  const transferred = utility.giftPass && product.benefitKind !== 'studio' && intent.state === 'fulfilled';
  if (!transferred && (pass.user_id !== intent.buyer_auth_user_id || pass.reserved_intent_id !== intent.id || !['reserved', 'consumed'].includes(pass.status))) throw new Error('MARKET_UTILITY_RESERVATION_MISSING');
  if (utility.benefitKind !== product.benefitKind || utility.studioDays !== product.studioDays || utility.name !== product.name) throw new Error('MARKET_UTILITY_TERMS_MISMATCH');
  if (utility.giftPass || product.benefitKind === 'studio') {
    if (snapshot.totalAmountCents !== 0 || snapshot.items?.length !== 0) throw new Error('MARKET_ENTITLEMENT_PAYMENT_MISMATCH');
  } else {
    if (snapshot.items?.length !== 1) throw new Error('MARKET_TICKET_STACKING_FORBIDDEN');
    const line = snapshot.items[0];
    const payment = calculateTicketPayment(product, line.licenseTier, Math.round((line.catalogUnitPrice ?? -1) * 100));
    if (payment.remainingCents !== snapshot.totalAmountCents || payment.discountCents !== utility.discountCents
      || Math.round(line.unitPrice * 100) !== payment.remainingCents) throw new Error('MARKET_DISCOUNT_PAYMENT_MISMATCH');
  }
  return utility;
}
