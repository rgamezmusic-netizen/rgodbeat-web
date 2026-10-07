'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RgMarketProduct, RgOwnedPass } from '@/lib/rg/product/catalog';
import { isGiftCheckoutVisible } from '@/lib/commerce/gift-feature';

/** A gift is submitted only by the explicit confirmation button. Counts refresh from the API. */
export function RgPassActions({ product, pass, onChanged, canBuy = true }: { product: RgMarketProduct; pass?: RgOwnedPass; onChanged?: () => Promise<void>; canBuy?: boolean }) {
  const router = useRouter();
  const [gift, setGift] = useState(false);
  const [kind, setKind] = useState<'email' | 'artist'>('email');
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [artist, setArtist] = useState<{ slug: string; stage_name: string } | null>(null);
  const [artists, setArtists] = useState<Array<{ slug: string; stage_name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!gift || kind !== 'artist' || search.trim().length < 2 || artist) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/gift/artists?q=${encodeURIComponent(search.trim())}`, { signal: controller.signal });
        const data = await response.json();
        if (response.ok) setArtists(data.artists ?? []);
        else setMessage(data.error || 'No se pudo buscar artistas.');
      } catch { if (!controller.signal.aborted) setMessage('No se pudo buscar artistas.'); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [gift, kind, search, artist]);

  const perform = async (asGift: boolean) => {
    setBusy(true); setMessage(null);
    const recipient = asGift ? { recipientMode: 'gift', recipientKind: kind, ...(kind === 'email' ? { recipientEmail: email.trim() } : { recipientArtistSlug: artist?.slug }) } : { recipientMode: 'self' };
    const storageKey = `rg-market-v1:${pass?.id ?? product.productKey}:${JSON.stringify(recipient)}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as { key: string; passId?: string } | null;
      const operation = saved ?? { key: crypto.randomUUID(), passId: pass?.id };
      sessionStorage.setItem(storageKey, JSON.stringify(operation));
      if (!operation.passId) {
        const purchase = await fetch('/api/rg/market/pass', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productKey: product.productKey, version: product.version, idempotencyKey: operation.key }) });
        const result = await purchase.json();
        if (!purchase.ok || typeof result.passId !== 'string') throw new Error(result.error || 'No se pudo comprar el pase.');
        operation.passId = result.passId;
        sessionStorage.setItem(storageKey, JSON.stringify(operation));
      }
      if (asGift || product.benefitKind === 'studio') {
        const response = await fetch('/api/checkout/rg-market', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passId: operation.passId, idempotencyKey: operation.key, items: [], giftPass: asGift, ...recipient }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
        setMessage(asGift ? result.giftStatus === 'claimed' ? 'Regalo asignado al destinatario.' : 'Regalo pendiente de reclamación.' : 'Studio extendido por 30 días.');
      } else setMessage('Pase agregado a MY PASSES.');
      sessionStorage.removeItem(storageKey);
      setGift(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar la operación.'); }
    finally {
      await onChanged?.();
      router.refresh(); window.dispatchEvent(new Event('rg-wallet-updated'));
      setBusy(false);
    }
  };
  const available = pass ? pass.status === 'available' : product.active && canBuy;
  const buttonClass = 'rounded-lg border border-white/15 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40';
  const cancel = async () => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/checkout/rg-market/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId: pass?.cancellableIntentId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cancelar.');
      setMessage('Pago cancelado. El pase está disponible.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo cancelar.'); }
    finally { await onChanged?.(); router.refresh(); window.dispatchEvent(new Event('rg-wallet-updated')); setBusy(false); }
  };
  if (pass?.status === 'reserved') return <div className="mt-3 space-y-2">
    {pass.resumeIntentId && <Link href={`/rg/wallet/checkout?intent=${encodeURIComponent(pass.resumeIntentId)}`} className={`${buttonClass} inline-block`}>CONTINUAR OPERACIÓN</Link>}
    {pass.cancellableIntentId && <button type="button" disabled={busy} onClick={() => void cancel()} className={buttonClass}>CANCELAR PAGO Y LIBERAR TICKET</button>}
    {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
  </div>;
  return <div className="mt-4 space-y-3">
    <div className="flex flex-wrap gap-2">
      {pass && product.benefitKind !== 'studio' && available ? <Link href="/beats" onClick={() => sessionStorage.setItem('rg-selected-pass-v1', pass.id)} className={buttonClass}>USE</Link>
        : <button type="button" disabled={!available || busy} onClick={() => void perform(false)} className={buttonClass}>{pass ? 'USE · +30 DÍAS' : 'GET FOR ME'}</button>}
      {product.giftable && isGiftCheckoutVisible() && <button type="button" disabled={!available || busy} onClick={() => { setGift(!gift); setMessage(null); }} className={buttonClass}>GIFT</button>}
    </div>
    {!pass && !product.active && <p className="text-xs text-zinc-500">Próximamente</p>}
    {!pass && product.active && !canBuy && <p className="text-xs text-zinc-500">Saldo gastable insuficiente.</p>}
    {gift && <form onSubmit={event => { event.preventDefault(); void perform(true); }} className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex gap-2">{(['email', 'artist'] as const).map(value => <button type="button" key={value} onClick={() => setKind(value)} aria-pressed={kind === value} className={`${buttonClass} ${kind === value ? 'border-amber-300 text-amber-200' : ''}`}>{value === 'email' ? 'EMAIL' : 'RG ARTIST'}</button>)}</div>
      {kind === 'email' ? <label className="block text-xs text-zinc-400">Correo del destinatario<input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-black p-3 text-white" /></label>
        : <div className="space-y-2"><label className="block text-xs text-zinc-400">Buscar RG Artist<input value={search} onChange={event => { setSearch(event.target.value); setArtist(null); setArtists([]); }} className="mt-2 w-full rounded-lg border border-white/15 bg-black p-3 text-white" /></label>
          {!artist && artists.map(row => <button type="button" key={row.slug} onClick={() => { setArtist(row); setSearch(row.stage_name); setArtists([]); }} className="block w-full rounded-lg bg-white/5 p-2 text-left text-sm text-white">{row.stage_name}</button>)}
          {artist && <p className="text-xs text-amber-200">Destinatario: {artist.stage_name}</p>}</div>}
      <p className="text-xs text-zinc-400">{product.benefitKind === 'studio' ? 'Los 30 días empiezan al activar o reclamar el regalo.' : 'El destinatario recibe este pase en su wallet para usarlo una vez.'}</p>
      <button type="submit" disabled={busy || (kind === 'artist' && !artist)} className="w-full rounded-lg bg-amber-300 p-3 text-xs font-bold text-black disabled:opacity-40">{busy ? 'PROCESANDO…' : pass ? 'CONFIRMAR REGALO' : `COMPRAR Y REGALAR · ${product.costRg.toLocaleString('en-US')} RG`}</button>
    </form>}
    {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
  </div>;
}
