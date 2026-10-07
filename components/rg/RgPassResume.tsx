'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { getStripeClient } from '@/lib/stripe/client';

export function RgPassResume({ intentId, gift }: { intentId: string; gift: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [payment, setPayment] = useState<{ clientSecret: string; sessionId: string } | null>(null);
  const [done, setDone] = useState(false);
  const complete = useCallback(async () => {
    if (!payment) return;
    setBusy(true);
    try {
      const response = await fetch('/api/checkout/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: payment.sessionId }) });
      const data = await response.json();
      if (response.status === 202) { setMessage('El pago sigue en proceso. Vuelve a comprobar su estado.'); return; }
      if (!response.ok) throw new Error(data.error || 'No se pudo comprobar el pago.');
      setDone(true); setPayment(null); setMessage('Operación completada. Consulta tu wallet y tus licencias.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo comprobar el pago.'); }
    finally { setBusy(false); }
  }, [payment]);
  const resume = async () => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/checkout/rg-market/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ intentId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo continuar.');
      if (data.clientSecret && data.sessionId) setPayment({ clientSecret: data.clientSecret, sessionId: data.sessionId });
      else { setDone(true); setMessage(data.giftStatus === 'ready_to_claim' ? 'Regalo preparado; pendiente de reclamación.' : 'Operación completada. Consulta tu wallet.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo continuar.'); }
    finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-lg space-y-5 px-4 py-10 text-white">
    <h1 className="text-2xl font-bold">Continuar operación RG</h1>
    <p className="text-sm text-zinc-400">{gift ? 'Continuarás el regalo que confirmaste, con el mismo destinatario y pase.' : 'Continuarás con el mismo pase y el importe validado al iniciar la operación.'}</p>
    {!payment && !done && <button type="button" disabled={busy} onClick={() => void resume()} className="w-full rounded-xl bg-amber-300 p-4 text-sm font-bold text-black disabled:opacity-40">{busy ? 'VALIDANDO…' : gift ? 'CONTINUAR REGALO' : 'CONTINUAR'}</button>}
    {payment && <><EmbeddedCheckoutProvider stripe={getStripeClient()} options={{ clientSecret: payment.clientSecret, onComplete: () => { void complete(); } }}><EmbeddedCheckout /></EmbeddedCheckoutProvider>
      <button type="button" disabled={busy} onClick={() => void complete()} className="rounded-lg border border-white/10 p-3 text-xs">COMPROBAR PAGO</button></>}
    {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
    <Link href="/rg/wallet" className="inline-block text-sm text-zinc-300 underline">VOLVER A MI WALLET</Link>
  </section>;
}
