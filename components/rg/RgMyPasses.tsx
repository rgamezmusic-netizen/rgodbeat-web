'use client';
import type { RgWalletSummary } from '@/lib/rg/product/wallet-client';
import { RgPassActions } from './RgPassActions';
export function RgMyPasses({ wallet, onChanged }: { wallet: RgWalletSummary; onChanged?: () => Promise<void> }) {
  return <section aria-label="MY PASSES" className="mt-6 space-y-4">
    <h2 className="text-sm font-bold tracking-wider text-white">MY PASSES</h2>
    {wallet.passes.length === 0 && <p className="text-sm text-zinc-400">Todavía no tienes pases.</p>}
    {wallet.products.filter(product => wallet.passes.some(pass => pass.productKey === product.productKey && pass.version === product.version)).map(product => {
      const owned = wallet.passes.filter(pass => pass.productKey === product.productKey && pass.version === product.version);
      return <article key={`${product.productKey}:${product.version}`} className="rounded-xl border border-white/10 p-4">
        <h3 className="font-semibold text-white">{product.name} ×{owned.filter(p => p.status === 'available').length}</h3>
        <p className="mt-1 text-xs text-zinc-400">{owned.filter(p => p.status === 'available').length} AVAILABLE · {owned.filter(p => p.status === 'reserved').length} RESERVED · {owned.filter(p => p.status === 'consumed').length} CONSUMED</p>
        {owned.filter(p => p.status === 'available' || p.cancellableIntentId || p.resumeIntentId).map(pass => <RgPassActions key={pass.id} product={product} pass={pass} onChanged={onChanged} />)}
        {owned.some(p => p.status === 'reserved') && <p className="mt-2 text-xs text-zinc-400">Los pases reservados esperan el pago o la reclamación de un regalo.</p>}
      </article>;
    })}
  </section>;
}
