import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createPhase2AdminClient } from '@/lib/rg/phase2/database';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para consultar RG Coin.' }, { status: 401 });
  try {
  const db = createPhase2AdminClient();
  const [balanceResult, configResult] = await Promise.all([
    db.from('rg_coin_balances').select('balance_rg').eq('user_id', user.id).maybeSingle(),
    db.from('rg_economy_config').select('rg_per_usd_cent,max_rg_discount_percent,purchases_enabled,redemption_enabled').eq('id', true).single(),
  ]);
  if (balanceResult.error || configResult.error || !configResult.data) return NextResponse.json({ error: 'RG Coin todavía no está disponible.' }, { status: 503 });
  const config = configResult.data as { rg_per_usd_cent: number; max_rg_discount_percent: number; purchases_enabled: boolean; redemption_enabled: boolean };
  return NextResponse.json({ balanceRg: Number((balanceResult.data as { balance_rg?: number | string } | null)?.balance_rg ?? 0),
    rgPerUsdCent: config.rg_per_usd_cent, maxDiscountPercent: Math.min(50, config.max_rg_discount_percent),
    purchasesEnabled: config.purchases_enabled, redemptionEnabled: config.redemption_enabled,
    cashWithdrawalEnabled: false, tradingEnabled: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'RG Coin todavía no está disponible.' }, { status: 503 });
  }
}
