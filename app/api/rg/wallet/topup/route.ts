import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { hasVerifiedEmail } from '@/lib/commerce/authorization';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { walletSameOrigin, walletRequestKey } from '@/lib/rg/wallet-request';
import { getStripe, isStripeConfigured } from '@/lib/stripe/server';

export async function POST(request: NextRequest) {
  if (!walletSameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ error: 'Inicia sesión con un correo verificado para comprar RG.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!walletRequestKey(body?.idempotencyKey) || !Number.isSafeInteger(body?.amountRg) || body.amountRg < 500 || body.amountRg > 1000000) {
    return NextResponse.json({ error: 'La compra mínima es de 500 RG (US$5). Introduce una cantidad entera válida.' }, { status: 400 });
  }
  try {
    const db = createCommerceAdminClient();
    const config = await db.from('rg_economy_config').select('wallet_v3_enabled,purchases_enabled,rg_per_usd_cent,purchase_price_cents_per_rg').eq('id', true).single();
    if (config.error || !config.data?.wallet_v3_enabled || !config.data.purchases_enabled || !isStripeConfigured()
      || Number(config.data.rg_per_usd_cent) !== 1 || Number(config.data.purchase_price_cents_per_rg) !== 1) {
      return NextResponse.json({ error: 'La compra de RG no está disponible en este momento.' }, { status: 503 });
    }
    // UPSERT cannot replace a frozen purchase or change its owner/amount.
    const saved = await db.from('rg_wallet_topups').upsert({ user_id: user.id, request_key: body.idempotencyKey,
      amount_rg: body.amountRg, amount_cents: body.amountRg }, { onConflict: 'user_id,request_key', ignoreDuplicates: true });
    if (saved.error) throw new Error('TOPUP_NOT_SAVED');
    const { data: topup, error } = await db.from('rg_wallet_topups').select('*').eq('user_id', user.id).eq('request_key', body.idempotencyKey).single();
    if (error || !topup || topup.amount_rg !== body.amountRg) return NextResponse.json({ error: 'Esta solicitud ya corresponde a otra compra.' }, { status: 409 });
    if (topup.status !== 'pending') return NextResponse.json({ error: 'Esta compra ya terminó. Consulta tus movimientos antes de iniciar otra.' }, { status: 409 });
    const stripe = getStripe();
    const session = topup.stripe_session_id ? await stripe.checkout.sessions.retrieve(topup.stripe_session_id) : await stripe.checkout.sessions.create({
      mode: 'payment', payment_method_types: ['card'], customer_email: user.email, client_reference_id: topup.id,
      metadata: { type: 'rg_wallet_topup', topupId: topup.id, userId: user.id },
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: topup.amount_cents,
        product_data: { name: `${topup.amount_rg.toLocaleString('en-US')} RG · RGodbeat`, description: 'Créditos internos para licencias de beats. No suman puntos al Top.' } } }],
      success_url: `${request.nextUrl.origin}/rg/wallet?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.nextUrl.origin}/rg/wallet?purchase=cancelled`,
    }, { idempotencyKey: `rg-topup:${topup.id}` });
    const bound = await db.from('rg_wallet_topups').update({ stripe_session_id: session.id }).eq('id', topup.id).eq('user_id', user.id);
    if (bound.error) throw new Error('TOPUP_SESSION_NOT_BOUND');
    if (session.status !== 'open' || !session.url) return NextResponse.json({ error: 'La sesión de pago terminó. Consulta tu saldo y crea una compra nueva si lo necesitas.' }, { status: 409 });
    return NextResponse.json({ url: session.url }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo abrir el pago. Reintenta la misma compra.' }, { status: 503 });
  }
}
