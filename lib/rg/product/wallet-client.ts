import type { getRgWalletSummary } from './wallet';

export type RgWalletSummary = Awaited<ReturnType<typeof getRgWalletSummary>>;

/** Read authenticated server totals; never derive balances or inventory in the browser. */
export async function fetchRgWalletSummary(): Promise<RgWalletSummary> {
  const response = await fetch('/api/rg/wallet', { cache: 'no-store' });
  if (!response.ok) throw new Error('No pudimos consultar tu saldo ni tus pases.');
  const data = await response.json();
  for (const key of ['balanceRg', 'availableBeatPasses', 'reservedBeatPasses', 'consumedBeatPasses', 'beatPassCostRg']) {
    if (!Number.isSafeInteger(data?.[key]) || data[key] < 0) throw new Error('No pudimos validar tu saldo ni tus pases.');
  }
  if (typeof data.beatPassEnabled !== 'boolean' || !Array.isArray(data.beatPassEligibleTiers)
    || !data.beatPassEligibleTiers.every((tier: unknown) => typeof tier === 'string')) {
    throw new Error('No pudimos validar el estado de RG Beat Pass.');
  }
  return data;
}
