import 'server-only';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';

/** Caller supplies only the UUID from a validated server session. */
export async function getRgWalletSummary(userId: string) {
  const db = createPhase2AdminClient();
  const [balance, config] = await Promise.all([
    db.from('rg_coin_balances').select('balance_rg').eq('user_id', userId).maybeSingle(),
    db.from('rg_economy_config').select('rg_per_usd_cent,max_rg_discount_percent,purchases_enabled,redemption_enabled').eq('id', true).single(),
  ]);
  if (balance.error || config.error || !config.data) throw new Error('RG balance is unavailable.');
  const settings = config.data as { rg_per_usd_cent: number; max_rg_discount_percent: number; purchases_enabled: boolean; redemption_enabled: boolean };
  const balanceRg = Number((balance.data as { balance_rg?: number | string } | null)?.balance_rg ?? 0);
  if (!Number.isSafeInteger(balanceRg) || balanceRg < 0) throw new Error('RG balance is invalid.');
  return { balanceRg, rgPerUsdCent: settings.rg_per_usd_cent, maxDiscountPercent: Math.min(50, settings.max_rg_discount_percent),
    purchasesEnabled: settings.purchases_enabled, redemptionEnabled: settings.redemption_enabled,
    cashWithdrawalEnabled: false, tradingEnabled: false };
}
