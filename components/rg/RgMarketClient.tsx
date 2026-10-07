'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchRgWalletSummary, type RgWalletSummary } from '@/lib/rg/product/wallet-client';
import { RgWalletStatus } from './RgWalletStatus';
import { RgPassActions } from './RgPassActions';
import { RgMyPasses } from './RgMyPasses';

type Wallet = RgWalletSummary;

export function RgMarketClient({ initialWallet }: { initialWallet: Wallet }) {
  const [wallet, setWallet] = useState<Wallet | null>(initialWallet);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const walletReadRef = useRef({ sequence: 0 });
  const refreshWallet = useCallback(async () => {
    const reads = walletReadRef.current;
    const readId = ++reads.sequence;
    setWalletLoading(true);
    setWallet(null);
    setWalletError(null);
    try {
      const summary = await fetchRgWalletSummary();
      if (readId === reads.sequence) setWallet(summary);
    }
    catch { if (readId === reads.sequence) setWalletError('No pudimos consultar tu saldo ni tus pases. Abre RG Wallet para volver a intentarlo.'); }
    finally { if (readId === reads.sequence) setWalletLoading(false); }
  }, []);

  useEffect(() => {
    const reads = walletReadRef.current;
    const refresh = () => { void refreshWallet(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('rg-wallet-updated', refresh);
    return () => {
      reads.sequence++;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('rg-wallet-updated', refresh);
    };
  }, [refreshWallet]);

  return <main className="mx-auto w-full max-w-5xl px-4 py-10 text-white sm:px-6">
    <header className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-[#17151f] to-[#0b0b10] p-6 sm:p-8">
      <p className="text-xs font-mono tracking-[0.2em] text-amber-300">RG WALLET / UTILIDAD</p>
      <h1 className="mt-3 text-3xl font-black sm:text-4xl">RG MARKET</h1>
      <p className="mt-2 max-w-xl text-sm text-zinc-400">Usa tus RG gastables para obtener licencias, descuentos y acceso Studio.</p>
      <div className="mt-6"><RgWalletStatus wallet={wallet} /></div>
      {walletLoading && <p role="status" className="mt-3 text-xs text-zinc-400">Consultando saldo y pases…</p>}
      {walletError && <p role="alert" className="mt-3 text-xs text-rose-300">{walletError}</p>}
    </header>

    {wallet && <>
      {(['beats', 'studio', 'other'] as const).map(section => <section key={section} className="mb-8">
        <h2 className="mb-4 text-sm font-bold tracking-wider text-zinc-300">{section === 'beats' ? 'BEATS' : section === 'studio' ? 'STUDIO' : 'OTHER BENEFITS'}</h2>
        <div className="grid gap-4 sm:grid-cols-2">{wallet.products.filter(product => product.section === section).map(product => <article key={`${product.productKey}:${product.version}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
          <h3 className="font-bold text-white">{product.name}</h3>
          <p className="mt-2 text-sm font-mono text-amber-200">{product.costRg.toLocaleString('en-US')} RG</p>
          <p className="mt-2 text-xs leading-5 text-zinc-400">{product.eligibility}</p>
          <p className="mt-2 text-[11px] text-zinc-500">Un uso · Sin vencimiento · Sin combinar pases</p>
          <RgPassActions product={product} canBuy={wallet.balanceRg >= product.costRg} onChanged={refreshWallet} />
        </article>)}</div>
        {!wallet.products.some(product => product.section === section) && <p className="text-xs text-zinc-500">Sin beneficios adicionales en V1.</p>}
      </section>)}
      <RgMyPasses wallet={wallet} onChanged={refreshWallet} />
    </>}
  </main>;
}
