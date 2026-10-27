'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchRgWalletSummary, type RgWalletSummary } from '@/lib/rg/product/wallet-client';

type Artist = { stage_name: string; slug: string };
const number = (n: number) => n.toLocaleString('es-MX');
const button = 'rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-wait disabled:opacity-40';
const input = 'mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white outline-none focus:border-amber-300';

export function RgWalletDashboard({ initialWallet }: { initialWallet: RgWalletSummary }) {
  const router = useRouter();
  const [wallet, setWallet] = useState(initialWallet);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [buyAmount, setBuyAmount] = useState('500');
  const [query, setQuery] = useState('');
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [now, setNow] = useState(() => Date.parse(initialWallet.rewardStatus?.serverTime || '1970-01-01T00:00:00Z'));
  const sequence = useRef(0);
  const purchaseKey = useRef<{ amount: number; key: string } | null>(null);
  const transferKey = useRef<{ facts: string; key: string } | null>(null);
  const [pendingSession, setPendingSession] = useState<string | null>(null);
  const refreshedBlock = useRef('');
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    const next = await fetchRgWalletSummary();
    if (request === sequence.current) setWallet(next);
  }, []);
  const announceUpdate = () => { window.dispatchEvent(new Event('rg-wallet-updated')); router.refresh(); };
  useEffect(() => {
    const update = () => { void refresh().catch(() => setError('No pudimos actualizar el saldo. Vuelve a consultar antes de operar.')); };
    window.addEventListener('focus', update); window.addEventListener('rg-wallet-updated', update);
    return () => { window.removeEventListener('focus', update); window.removeEventListener('rg-wallet-updated', update); };
  }, [refresh]);
  useEffect(() => {
    const sample = Date.parse(wallet.rewardStatus?.serverTime || '');
    if (!Number.isFinite(sample)) return;
    const started = performance.now();
    const update = () => setNow(sample + performance.now() - started);
    queueMicrotask(update);
    const timer = setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [wallet.rewardStatus?.serverTime]);
  const completePurchase = useCallback(async (sessionId: string) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/rg/wallet/topup/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No pudimos confirmar el abono.');
      if (response.status === 202) { setNotice('El pago sigue pendiente. Puedes volver a consultar su estado.'); return; }
      await refresh();
      setNotice(data.reversed ? 'Esta compra fue reembolsada o está en disputa. Consulta tus movimientos.' : `Compra confirmada: ${number(data.amountRg)} RG. El saldo ya está actualizado.`);
      setPendingSession(null);
      window.history.replaceState(null, '', '/rg/wallet');
      window.dispatchEvent(new Event('rg-wallet-updated')); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar el pago.'); }
    finally { setBusy(false); }
  }, [refresh, router]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('session_id');
    const timer = setTimeout(() => { if (id) { setPendingSession(id); void completePurchase(id); } }, 0);
    return () => clearTimeout(timer);
  }, [completePurchase]);
  useEffect(() => {
    if (artist || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/gift/artists?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: 'no-store' })
        .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (!controller.signal.aborted) setArtists(data.artists || []); })
        .catch(e => { if (!controller.signal.aborted) setError(e.message || 'No pudimos buscar artistas.'); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, artist]);
  const buy = async () => {
    const amount = Number(buyAmount);
    if (!Number.isSafeInteger(amount) || amount < 500 || amount > 1000000) { setError('La compra mínima es de 500 RG (US$5).'); return; }
    setBusy(true); setError(''); setNotice('');
    if (purchaseKey.current?.amount !== amount) purchaseKey.current = { amount, key: crypto.randomUUID() };
    try {
      const response = await fetch('/api/rg/wallet/topup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountRg: amount, idempotencyKey: purchaseKey.current.key }) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 409) purchaseKey.current = null; throw new Error(data.error); }
      const destination = new URL(data.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'checkout.stripe.com') throw new Error('No se recibió un enlace de pago válido.');
      window.location.assign(destination.href);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el pago.'); setBusy(false); }
  };
  const transfer = async () => {
    if (!artist) return;
    const amount = Number(sendAmount);
    const facts = JSON.stringify({ artist: artist.slug, amount });
    if (transferKey.current?.facts !== facts) transferKey.current = { facts, key: crypto.randomUUID() };
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/rg/wallet/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artistSlug: artist.slug, amountRg: amount, idempotencyKey: transferKey.current.key }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo confirmar el envío.');
      setNotice(`${number(amount)} RG enviados a ${artist.stage_name}.`); setConfirmSend(false); setSendAmount(''); transferKey.current = null;
      await refresh(); announceUpdate();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo confirmar el envío.'); }
    finally { setBusy(false); }
  };
  const resume = async (intentId: string) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/checkout/rg-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intentId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await refresh(); announceUpdate(); setNotice('Licencia preparada. Tus archivos están en Mi cuenta.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo recuperar la compra.'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    const resetsAt = wallet.rewardStatus?.resetsAt;
    if (resetsAt && now >= new Date(resetsAt).getTime() && refreshedBlock.current !== resetsAt) {
      refreshedBlock.current = resetsAt;
      void refresh().catch(() => setError('No se pudo actualizar el nuevo bloque. Pulsa Actualizar.'));
    }
  }, [wallet.rewardStatus?.resetsAt, now, refresh]);
  const status = wallet.rewardStatus;
  const milliseconds = status ? Math.max(0, new Date(status.resetsAt).getTime() - now) : 0;
  const countdown = `${Math.floor(milliseconds / 3600000)} h ${Math.floor(milliseconds % 3600000 / 60000)} min`;
  const validSend = artist && Number.isSafeInteger(Number(sendAmount)) && Number(sendAmount) > 0 && Number(sendAmount) <= wallet.balanceRg;
  return <div className="space-y-7 text-white">
    <header className="rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-300/[0.08] to-black/30 p-6 sm:p-9">
      <p className="text-xs font-mono tracking-[0.2em] text-amber-200">MI RG WALLET</p>
      <h1 className="mt-3 text-5xl font-extrabold tracking-tight tabular-nums sm:text-6xl">{number(wallet.balanceRg)} <span className="text-xl text-amber-200">RG</span></h1>
      <p className="mt-4 text-sm text-zinc-300">{wallet.redemptionEnabled ? '100 RG = US$1 en licencias de beats.' : 'Tus RG se conservan en tu wallet entre temporadas.'}</p>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">{wallet.purchasesEnabled || wallet.transfersEnabled ? 'Gana RG publicando, compra saldo o apoya a un artista.' : 'Gana RG publicando tus canciones desde Studio.'} El saldo se conserva entre temporadas; los puntos del Top compiten por separado.</p>
      {!wallet.redemptionEnabled && <p className="mt-3 text-xs text-zinc-400">El canje de RG por licencias todavía no está disponible.</p>}
      <Link href="/beats" className={`${button} mt-6 inline-block`}>ELEGIR UN BEAT →</Link>
    </header>
    <div aria-live="polite" className="space-y-3">
      {notice && <p role="status" className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4 text-sm text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-sm text-red-200">{error}</p>}
      {pendingSession && <button disabled={busy} className={button} onClick={() => void completePurchase(pendingSession!)}>CONSULTAR ESTADO DEL PAGO</button>}
      {wallet.debtRg > 0 && <p className="text-sm text-red-200">Ajuste pendiente: {number(wallet.debtRg)} RG por reembolso o disputa. Los nuevos abonos compensarán ese ajuste.</p>}
    </div>
    {status && <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Publica y gana</h2><span className="text-sm text-zinc-400">Temporada {status.seasonNumber} · {number(status.seasonPoints)} puntos</span></div>
      <div className="mt-5 grid grid-cols-3 gap-3">{[23, 7, 4].map((amount, i) => <div key={amount} className={`rounded-xl border p-4 text-center ${i < status.rewarded ? 'border-emerald-400/25 bg-emerald-400/5' : 'border-amber-300/20 bg-amber-300/5'}`}><p className="text-xs text-zinc-400">CANCIÓN {i + 1}</p><p className="mt-2 text-2xl font-bold">{amount} <span className="text-xs text-amber-200">RG</span></p><p className="mt-1 text-xs text-zinc-400">+{amount} puntos {i < status.rewarded ? '✓' : ''}</p></div>)}</div>
      <p suppressHydrationWarning className="mt-4 text-sm text-zinc-300">{status.remaining > 0 ? `${status.remaining} premios disponibles en este bloque.` : 'Ya recibiste los tres premios de este bloque.'} Se renuevan en {countdown}.</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">Tres canciones distintas por cuenta en cada bloque fijo de 12 horas. Hasta 68 RG y 68 puntos en los dos bloques del día de recompensas. Volver a subir el mismo archivo no genera otro premio.</p>
      <Link href="/studio" className="mt-4 inline-block text-sm font-bold text-amber-200">ABRIR STUDIO →</Link>
    </section>}
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/10 p-6"><h2 className="text-lg font-bold">Comprar RG</h2><p className="mt-2 text-sm text-zinc-400">{wallet.purchasesEnabled ? 'Elige la cantidad. Comprar RG no suma puntos al Top.' : 'Comprar RG no suma puntos al Top.'}</p>
        {!wallet.purchasesEnabled && <p role="status" className="mt-5 rounded-xl border border-white/10 p-4 text-sm text-zinc-400">La compra de RG todavía no está disponible.</p>}
        <fieldset disabled={!wallet.purchasesEnabled} className={!wallet.purchasesEnabled ? 'hidden' : undefined}>
        <div className="mt-5 grid grid-cols-2 gap-2">{[500, 1000, 2000, 5000].map(n => <button key={n} disabled={busy} onClick={() => setBuyAmount(String(n))} aria-pressed={buyAmount === String(n)} className={`rounded-xl border px-3 py-3 text-left ${buyAmount === String(n) ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 hover:border-white/30'}`}><strong className="block text-sm">{number(n)} RG</strong><span className="text-xs text-zinc-400">US${n / 100}</span></button>)}</div>
        <label className="mt-5 block text-sm text-zinc-300">Cantidad de RG<input className={input} type="number" inputMode="numeric" min="500" max="1000000" step="1" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} disabled={busy} /></label>
        <p className="mt-3 text-sm text-amber-100">Total: US${Number.isFinite(Number(buyAmount)) ? (Number(buyAmount) / 100).toFixed(2) : '—'}</p>
        <button className={`${button} mt-5 w-full`} disabled={busy || !wallet.purchasesEnabled || !Number.isSafeInteger(Number(buyAmount)) || Number(buyAmount) < 500 || Number(buyAmount) > 1000000} onClick={() => void buy()}>{busy ? 'PROCESANDO…' : 'CONTINUAR AL PAGO SEGURO'}</button>
        <p className="mt-3 text-xs leading-relaxed text-zinc-500">Compra mínima: US$5. RG es saldo interno de RGodbeat para licencias. No se retira como dinero ni se negocia fuera de la plataforma.</p>
        </fieldset>
      </section>
      <section className="rounded-2xl border border-white/10 p-6"><h2 className="text-lg font-bold">Apoyar a un artista</h2><p className="mt-2 text-sm text-zinc-400">{wallet.transfersEnabled ? 'Envía RG a su wallet para que pueda elegir sus beats. El envío no cambia el Top.' : 'El apoyo con RG no cambia las posiciones del Top.'}</p>
        {!wallet.transfersEnabled && <p role="status" className="mt-5 rounded-xl border border-white/10 p-4 text-sm text-zinc-400">Los envíos de RG todavía no están disponibles.</p>}
        <fieldset disabled={!wallet.transfersEnabled} className={!wallet.transfersEnabled ? 'hidden' : undefined}>
        <label className="mt-5 block text-sm text-zinc-300">Buscar artista<input className={input} value={query} maxLength={60} disabled={busy} placeholder="Nombre o @artista" onChange={e => { setQuery(e.target.value); setArtist(null); setArtists([]); setConfirmSend(false); }} /></label>
        {artists.length > 0 && !artist && <ul className="mt-2 max-h-48 overflow-auto rounded-xl border border-white/10">{artists.map(a => <li key={a.slug}><button className="w-full px-4 py-3 text-left text-sm hover:bg-white/5" onClick={() => { setArtist(a); setQuery(a.stage_name); setArtists([]); setConfirmSend(false); }}><strong>{a.stage_name}</strong><span className="ml-2 text-xs text-zinc-500">@{a.slug}</span></button></li>)}</ul>}
        {artist && <p className="mt-3 text-sm text-amber-100">Destinatario: {artist.stage_name} · @{artist.slug}</p>}
        <label className="mt-5 block text-sm text-zinc-300">RG que quieres enviar<input className={input} type="number" inputMode="numeric" min="1" max={wallet.balanceRg} step="1" value={sendAmount} disabled={busy} onChange={e => { setSendAmount(e.target.value); setConfirmSend(false); }} /></label>
        {confirmSend && artist ? <div className="mt-5 space-y-3"><p className="text-sm text-amber-100">Confirma el envío de {number(Number(sendAmount))} RG a {artist.stage_name} (@{artist.slug}).</p><button className={`${button} w-full`} disabled={busy || !validSend} onClick={() => void transfer()}>CONFIRMAR ENVÍO</button><button className="text-sm text-zinc-400 underline" disabled={busy} onClick={() => setConfirmSend(false)}>Cancelar</button></div>
          : <button className={`${button} mt-5 w-full`} disabled={busy || !wallet.transfersEnabled || !validSend} onClick={() => setConfirmSend(true)}>REVISAR ENVÍO</button>}
        </fieldset>
      </section>
    </div>
    {wallet.pendingRedemptions.length > 0 && <section className="rounded-2xl border border-amber-300/20 p-6"><h2 className="text-lg font-bold">Compras por terminar</h2><p className="mt-2 text-sm text-zinc-400">El saldo ya está reservado. Retomar prepara la licencia sin volver a cobrar.</p>{wallet.pendingRedemptions.map(r => <button key={r.intentId} className={`${button} mt-4 mr-3`} disabled={busy} onClick={() => void resume(r.intentId)}>RETOMAR COMPRA · {number(r.amountRg)} RG</button>)}</section>}
    {(wallet.availableBeatPasses > 0 || wallet.reservedBeatPasses > 0) && <section className="rounded-2xl border border-white/10 p-6"><h2 className="text-lg font-bold">Tus pases anteriores</h2><p className="mt-2 text-sm text-zinc-400">Conservas {wallet.availableBeatPasses} Beat Pass disponibles y {wallet.reservedBeatPasses} reservados. Puedes usar los disponibles desde el carrito.</p></section>}
    <section className="rounded-2xl border border-white/10 p-6"><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-bold">Últimos movimientos</h2><button className="text-xs font-bold text-amber-200" disabled={busy} onClick={() => void refresh().catch(() => setError('No se pudo actualizar el saldo.'))}>ACTUALIZAR</button></div>
      {wallet.movements.length ? <ul className="mt-4 divide-y divide-white/10">{wallet.movements.map(m => <li key={m.id} className="flex justify-between gap-4 py-4"><div className="min-w-0"><p className="text-sm">{m.reason}</p><time suppressHydrationWarning className="mt-1 block text-xs text-zinc-500" dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('es-MX')}</time></div><strong className={`shrink-0 text-sm tabular-nums ${m.amount > 0 ? 'text-emerald-300' : 'text-zinc-300'}`}>{m.amount > 0 ? '+' : ''}{number(m.amount)} RG</strong></li>)}</ul> : <p className="mt-4 text-sm text-zinc-400">Todavía no tienes movimientos. Tu primera canción premiada aparecerá aquí.</p>}
      <Link href="/account" className="mt-5 inline-block text-sm text-amber-200">MIS LICENCIAS Y ARCHIVOS →</Link>
    </section>
  </div>;
}
