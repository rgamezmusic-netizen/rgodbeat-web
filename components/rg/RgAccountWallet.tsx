import Link from 'next/link';
import { RgWalletStatus } from './RgWalletStatus';
import type { getRgWalletSummary } from '@/lib/rg/product/wallet';

type Wallet = Awaited<ReturnType<typeof getRgWalletSummary>>;

export function RgAccountWallet({ wallet }: { wallet: Wallet | null }) {
  return (
    <section aria-labelledby="account-wallet-title" className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.06] to-[#0e0e14] p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-mono tracking-[0.2em] text-amber-300">SOLO VISIBLE PARA TI</p>
          <h2 id="account-wallet-title" className="mt-2 text-xl font-extrabold">Mi RG Wallet</h2>
          {wallet ? (
            <div className="mt-5"><RgWalletStatus wallet={wallet} /></div>
          ) : (
            <p role="alert" className="mt-4 text-sm text-zinc-400">No pudimos consultar tu saldo ni tus pases. Abre la wallet para volver a intentarlo.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/rg/wallet" className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-xs font-mono font-bold text-amber-200 hover:bg-amber-300/20">VER MI WALLET →</Link>
          <Link href="/rg/market" className="rounded-lg border border-white/10 px-4 py-3 text-xs font-mono font-bold text-zinc-300 hover:bg-white/5">RG MARKET →</Link>
        </div>
      </div>
      {wallet && <p className="mt-5 text-xs leading-relaxed text-zinc-400">Al canjear RG por un Beat Pass, esos RG se descuentan del saldo y el pase queda disponible hasta que lo uses en una compra elegible.</p>}
    </section>
  );
}
