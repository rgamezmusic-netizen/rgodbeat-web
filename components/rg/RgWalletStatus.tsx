import { formatRg } from '@/lib/rg/product/presentation';
import type { RgWalletSummary } from '@/lib/rg/product/wallet-client';

type Status = Pick<RgWalletSummary, 'balanceRg' | 'availableBeatPasses' | 'reservedBeatPasses' | 'consumedBeatPasses'>;

export function RgWalletStatus({ wallet }: { wallet: Status | null }) {
  if (!wallet) return <p role="status" className="text-sm text-zinc-400">Saldo y pases sin confirmar. Vuelve a consultar tu RG Wallet.</p>;
  return <div aria-label="RG Wallet status" aria-live="polite" className="space-y-3">
    <dl className="flex flex-wrap gap-x-10 gap-y-4">
      <div><dt className="text-xs font-mono tracking-wider text-zinc-400">RG BALANCE</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-white">{formatRg(wallet.balanceRg)} RG</dd></div>
      <div><dt className="text-xs font-mono tracking-wider text-amber-300">RG BEAT PASS</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-amber-200">{formatRg(wallet.availableBeatPasses)} AVAILABLE</dd></div>
    </dl>
    <p className="text-xs font-mono text-zinc-400">{formatRg(wallet.reservedBeatPasses)} RESERVED · {formatRg(wallet.consumedBeatPasses)} CONSUMED</p>
  </div>;
}
