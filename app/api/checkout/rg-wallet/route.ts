import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getCurrentUser } from '@/lib/auth/server';
import { hasVerifiedEmail } from '@/lib/commerce/authorization';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { fulfillStripeCheckoutSession, resolveAuthoritativeCart } from '@/lib/commerce/fulfillment';
import { walletSameOrigin, walletRequestKey, rgCostFromUsd } from '@/lib/rg/wallet-request';

export async function POST(request: NextRequest) {
  if (!walletSameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ error: 'Inicia sesión con un correo verificado para usar tus RG.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const db = createCommerceAdminClient();
  let intentId: string;
  let amountRg: number;
  try {
    if (body?.intentId) {
      if (!walletRequestKey(body.intentId)) return NextResponse.json({ error: 'Compra no válida.' }, { status: 400 });
      const pending = await db.from('rg_wallet_redemptions').select('intent_id,amount_rg').eq('intent_id', body.intentId).eq('user_id', user.id).maybeSingle();
      if (pending.error || !pending.data) return NextResponse.json({ error: 'No se encontró esta compra en tu wallet.' }, { status: 404 });
      intentId = pending.data.intent_id; amountRg = Number(pending.data.amount_rg);
    } else {
      if (body?.recipientMode && body.recipientMode !== 'self') return NextResponse.json({ error: 'Para apoyar a un artista, envíale RG desde tu wallet.' }, { status: 400 });
      if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 20
        || body.items.some((i: { beatId?: unknown; licenseTier?: unknown }) => !walletRequestKey(i?.beatId) || !['mp3', 'wav', 'unlimited'].includes(String(i.licenseTier)))
        || new Set(body.items.map((i: { beatId: string; licenseTier: string }) => `${i.beatId}:${i.licenseTier}`)).size !== body.items.length) {
        return NextResponse.json({ error: 'Selecciona licencias MP3, WAV o Unlimited sin repetirlas.' }, { status: 400 });
      }
      const facts = JSON.stringify(body.items.map((i: { beatId: string; licenseTier: string }) => ({ beatId: i.beatId, licenseTier: i.licenseTier })));
      if (!body.quoteOnly && !walletRequestKey(body.idempotencyKey)) return NextResponse.json({ error: 'Solicitud de compra no válida.' }, { status: 400 });
      const previous = !body.quoteOnly ? await db.from('commerce_checkout_intents').select('id,snapshot')
        .eq('buyer_auth_user_id', user.id).eq('beat_pass_request_key', `wallet:${body.idempotencyKey}`).maybeSingle() : { data: null, error: null };
      if (previous.error) throw new Error('WALLET_REQUEST_UNAVAILABLE');
      if (previous.data) {
        if (previous.data.snapshot?.requestFacts !== facts) return NextResponse.json({ error: 'Esta solicitud ya corresponde a otra compra.' }, { status: 409 });
        intentId = previous.data.id; amountRg = previous.data.snapshot.rgAmount;
      } else {
        const cart = await resolveAuthoritativeCart(body.items);
        amountRg = cart.items.reduce((sum, item) => sum + rgCostFromUsd(item.unitPrice), 0);
        if (body.quoteOnly) return NextResponse.json({ amountRg, totalUsd: amountRg / 100 }, { headers: { 'Cache-Control': 'private, no-store' } });
        // The displayed quote must still match before money is reserved.
        if (body.expectedAmountRg !== amountRg) return NextResponse.json({ error: 'El precio cambió. Actualiza el importe antes de confirmar.', priceChanged: true }, { status: 409 });
        intentId = randomUUID();
        const saved = await db.from('commerce_checkout_intents').insert({ id: intentId, buyer_auth_user_id: user.id, buyer_email: user.email,
          recipient_mode: 'self', beat_pass_request_key: `wallet:${body.idempotencyKey}`, snapshot_version: 1,
          snapshot: { version: 3, kind: 'rg_wallet', paymentMethod: 'rg_wallet', requestFacts: facts,
            siteOrigin: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
            rgAmount: amountRg, totalAmountCents: 0, currency: 'usd',
            items: cart.items.map(i => ({ ...i, catalogUnitPrice: i.unitPrice, unitPrice: 0 })) } });
        if (saved.error) return NextResponse.json({ error: 'La compra no se inició. Reintenta la misma solicitud.' }, { status: saved.error.code === '23505' ? 409 : 503 });
      }
    }
    const reserve = await db.rpc('rg_reserve_wallet_checkout', { p_user_id: user.id, p_intent_id: intentId });
    if (reserve.error) return NextResponse.json({ error: reserve.error.message.includes('insufficient_rg') ? 'No tienes suficientes RG para esta compra.' : 'No se pudo reservar el saldo. Reintenta la misma compra.' }, { status: 409 });
    // Internal redemption adapter. This is never accepted as a paid card session:
    // fulfillment independently verifies the frozen owner and the ledger debit.
    const session = { id: `rgwallet:${intentId}`, payment_status: 'paid', amount_total: 0, currency: 'usd',
      customer: null, payment_intent: null, customer_details: { email: user.email },
      metadata: { type: 'rg_wallet', commerceIntentId: intentId } } as unknown as Stripe.Checkout.Session;
    const result = await fulfillStripeCheckoutSession(session);
    if (result.status === 'payment_reversed') throw new Error('WALLET_PURCHASE_REVERSED');
    const purchases = await db.from('purchases').select('id,license_tier,beats(title)').eq('order_id', result.orderId);
    if (purchases.error) throw new Error('WALLET_FILES_PENDING');
    return NextResponse.json({ status: result.status, orderId: result.orderId, amountRg, totalAmount: 0, paymentMethod: 'rg_wallet',
      purchases: (purchases.data || []).map(p => ({ id: p.id, licenseTier: p.license_tier,
        beatTitle: Array.isArray(p.beats) ? p.beats[0]?.title : (p.beats as { title?: string })?.title })) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se terminó de preparar la licencia. Reintenta esta misma compra o retómala desde tu wallet; el saldo no se descontará dos veces.' }, { status: 503 });
  }
}
