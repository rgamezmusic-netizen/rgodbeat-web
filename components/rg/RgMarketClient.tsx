'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Wallet = { balanceRg: number; beatPassEnabled: boolean; beatPassCostRg: number; availableBeatPasses: number };

export function RgMarketClient({ initialWallet }: { initialWallet: Wallet }) {
  const router = useRouter();
  const [wallet, setWallet] = useState(initialWallet);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buyPass = async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const storageKey = 'rg-beat-pass-purchase-request-v1';
      const requestKey = sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, requestKey);
      const response = await fetch('/api/rg/market/pass', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: requestKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo comprar el pase.');
      setWallet(current => ({ ...current, balanceRg: Number(data.balanceRg ?? current.balanceRg),
        availableBeatPasses: Number(data.availableBeatPasses ?? current.availableBeatPasses + 1) }));
      setMessage('RG Beat Pass agregado a tu cuenta.');
      sessionStorage.removeItem(storageKey);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo comprar el pase.'); }
    finally { setBusy(false); }
  };

  return <main className="mx-auto w-full max-w-5xl px-4 py-10 text-white sm:px-6">
    <header className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-[#17151f] to-[#0b0b10] p-6 sm:p-8">
      <p className="text-xs font-mono tracking-[0.2em] text-amber-300">RG WALLET / UTILIDAD</p>
      <h1 className="mt-3 text-3xl font-black sm:text-4xl">RG MARKET</h1>
      <p className="mt-2 max-w-xl text-sm text-zinc-400">Usa RG para desbloquear utilidades internas. RG no tiene conversión a USD en este producto.</p>
      <div className="mt-6"><span className="text-xs font-mono text-zinc-500">TU SALDO</span><p className="text-3xl font-bold">{wallet.balanceRg.toLocaleString('en-US')} <span className="text-amber-300">RG</span></p></div>
    </header>

    <section className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-5 sm:p-7">
      <div>
        <p className="text-[10px] font-mono tracking-[0.2em] text-amber-300">UTILIDAD RG</p>
        <h2 className="mt-2 text-2xl font-extrabold">RG BEAT PASS</h2>
        <p className="mt-2 text-sm text-zinc-300">Canjea un pase por una licencia elegible Standard MP3 de un beat, por $0.</p>
        <p className="mt-3 text-sm font-mono text-amber-200">COSTO: {wallet.beatPassCostRg.toLocaleString('en-US')} RG</p>
        <p className="mt-2 text-xs text-zinc-500">Pases disponibles: {wallet.availableBeatPasses}</p>
      </div>
      <button type="button" onClick={() => void buyPass()} disabled={busy || !wallet.beatPassEnabled || wallet.balanceRg < wallet.beatPassCostRg}
        className="min-h-12 rounded-xl bg-amber-300 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45">
        {busy ? 'PROCESANDO…' : wallet.availableBeatPasses > 0 ? 'COMPRAR OTRO PASE' : 'COMPRAR PASE'}
      </button>
    </section>
    {!wallet.beatPassEnabled && <p className="mt-4 text-xs text-zinc-500">RG Beat Pass se habilitará cuando el producto esté listo para canje.</p>}
    {wallet.balanceRg < wallet.beatPassCostRg && <p className="mt-3 text-xs text-zinc-500">Necesitas más RG para comprar el pase.</p>}
    {message && <p role="status" className="mt-4 text-sm text-emerald-300">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
  </main>;
}
