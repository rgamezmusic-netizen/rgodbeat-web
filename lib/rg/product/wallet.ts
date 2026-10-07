import 'server-only';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Caller supplies only the UUID from a validated server session. */
export async function getRgWalletSummary(userId: string) {
  const db = createPhase2AdminClient() as unknown as SupabaseClient;
  const [balance, config, passes] = await Promise.all([
    db.from('rg_coin_balances').select('balance_rg').eq('user_id', userId).maybeSingle(),
    db.from('rg_economy_config').select('rg_per_usd_cent,max_rg_discount_percent,purchases_enabled,redemption_enabled,beat_pass_enabled,beat_pass_cost_rg,beat_pass_eligible_license_tiers').eq('id', true).single(),
    db.from('rg_beat_passes').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'available'),
  ]);
  if (balance.error || config.error || !config.data || passes.error) throw new Error('RG balance is unavailable.');
  const settings = config.data as unknown as { rg_per_usd_cent: number; max_discount_percent?: number; max_rg_discount_percent: number; purchases_enabled: boolean; redemption_enabled: boolean; beat_pass_enabled: boolean; beat_pass_cost_rg: number; beat_pass_eligible_license_tiers: string[] };
  const balanceRg = Number((balance.data as { balance_rg?: number | string } | null)?.balance_rg ?? 0);
  if (!Number.isSafeInteger(balanceRg) || balanceRg < 0) throw new Error('RG balance is invalid.');
  return { balanceRg, rgPerUsdCent: settings.rg_per_usd_cent, maxDiscountPercent: Math.min(50, settings.max_rg_discount_percent),
    purchasesEnabled: settings.purchases_enabled, redemptionEnabled: settings.redemption_enabled,
    beatPassEnabled: settings.beat_pass_enabled, beatPassCostRg: Number(settings.beat_pass_cost_rg),
    beatPassEligibleTiers: settings.beat_pass_eligible_license_tiers, availableBeatPasses: passes.count ?? 0,
    cashWithdrawalEnabled: false, tradingEnabled: false };
}
