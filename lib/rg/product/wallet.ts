import 'server-only';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readMarketProduct, type RgOwnedPass } from './catalog';

async function readOwnedInventory(db: SupabaseClient, userId: string) {
  const columns = 'id,product_key,product_version,status,reserved_intent_id';
  const first = await db.from('rg_beat_passes').select(columns, { count: 'exact' }).eq('user_id', userId)
    .order('purchased_at', { ascending: false }).order('id').range(0, 499);
  if (first.error || !first.data || first.count === null || !Number.isSafeInteger(first.count)) throw new Error('RG pass inventory is unavailable.');
  const rows = [...first.data];
  for (let offset = 500; offset < first.count; offset += 500) {
    const page = await db.from('rg_beat_passes').select(columns).eq('user_id', userId)
      .order('purchased_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (page.error || !page.data) throw new Error('RG pass inventory is unavailable.');
    rows.push(...page.data);
  }
  if (rows.length !== first.count || new Set(rows.map(p => p.id)).size !== first.count) throw new Error('RG pass inventory changed during reading.');
  return { data: rows, error: null };
}

/** Caller supplies only the UUID from a validated server session. */
export async function getRgWalletSummary(userId: string) {
  const db = createPhase2AdminClient() as unknown as SupabaseClient;
  const [balance, config, inventory, catalog] = await Promise.all([
    db.from('rg_spendable_balances').select('balance_rg').eq('user_id', userId).maybeSingle(),
    db.from('rg_economy_config').select('beat_pass_enabled,beat_pass_eligible_license_tiers,market_v1_enabled').eq('id', true).single(),
    readOwnedInventory(db, userId),
    db.from('rg_market_products').select('*').order('cost_rg'),
  ]);
  if (balance.error || config.error || !config.data || inventory.error || !inventory.data || catalog.error || !catalog.data) throw new Error('RG balance is unavailable.');
  const settings = config.data;
  const balanceRg = Number((balance.data as { balance_rg?: number | string } | null)?.balance_rg ?? 0);
  if (!Number.isSafeInteger(balanceRg) || balanceRg < 0) throw new Error('RG balance is invalid.');
  const products = catalog.data.map(row => {
    const product = readMarketProduct(row);
    return { ...product, active: product.active && (product.productKey === 'beat_pass' ? settings.beat_pass_enabled : settings.market_v1_enabled) };
  });
  const reservedIntentIds = inventory.data.filter(p => p.status === 'reserved' && p.reserved_intent_id).map(p => p.reserved_intent_id);
  const cancellable = new Set<string>();
  const resumable = new Set<string>();
  if (reservedIntentIds.length) {
    const intents = await db.from('commerce_checkout_intents').select('id,state,snapshot,verified_paid_at').eq('buyer_auth_user_id', userId)
      .in('id', reservedIntentIds);
    if (intents.error || !intents.data) throw new Error('RG reservation state is unavailable.');
    for (const intent of intents.data) if (intent.snapshot?.paymentMethod === 'rg_market') {
      if (!intent.verified_paid_at && ['awaiting_payment', 'expired', 'failed'].includes(intent.state)) cancellable.add(intent.id);
      if (['awaiting_payment', 'fulfilling', 'fulfilled'].includes(intent.state)) resumable.add(intent.id);
    }
  }
  const passes: RgOwnedPass[] = inventory.data.map(row => {
    if (!products.some(p => p.productKey === row.product_key && p.version === row.product_version)
      || !['available', 'reserved', 'consumed'].includes(row.status)) throw new Error('RG pass inventory is invalid.');
    return { id: row.id, productKey: row.product_key, version: row.product_version, status: row.status,
      cancellableIntentId: cancellable.has(row.reserved_intent_id) ? row.reserved_intent_id : null,
      resumeIntentId: resumable.has(row.reserved_intent_id) ? row.reserved_intent_id : null };
  });
  const beatPass = products.find(p => p.productKey === 'beat_pass' && p.version === 1);
  if (!beatPass) throw new Error('RG Beat Pass catalog unavailable.');
  const count = (status: RgOwnedPass['status']) => passes.filter(p => p.productKey === 'beat_pass' && p.status === status).length;
  return { balanceRg, products, passes,
    beatPassEnabled: beatPass.active, beatPassCostRg: beatPass.costRg,
    beatPassEligibleTiers: [beatPass.allowedCategory] as string[], availableBeatPasses: count('available'),
    reservedBeatPasses: count('reserved'), consumedBeatPasses: count('consumed'),
    cashWithdrawalEnabled: false, tradingEnabled: false };
}
