import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getCurrentUser } from '@/lib/auth/server';
import { hasVerifiedEmail } from '@/lib/commerce/authorization';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { fulfillStripeCheckoutSession, resolveAuthoritativeCart } from '@/lib/commerce/fulfillment';
import { resolveGiftRecipient, type GiftRecipientInput } from '@/lib/commerce/gift-recipient';
import { calculateTicketPayment, readMarketProduct } from '@/lib/rg/product/catalog';
import { getStripe, isStripeConfigured } from '@/lib/stripe/server';
import type { CheckoutItemPayload } from '@/types/commerce';

export const dynamic = 'force-dynamic';
type Body = GiftRecipientInput & { passId?: string; idempotencyKey?: string; items?: CheckoutItemPayload[]; giftPass?: boolean; quoteOnly?: boolean };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function completedPurchases(db: ReturnType<typeof createCommerceAdminClient>, orderId: string, gift: boolean) {
  if (gift) return [];
  const result = await db.from('purchases').select('id,license_tier,beats(title)').eq('order_id', orderId);
  if (result.error) throw new Error('Completed purchase inventory unavailable.');
  return (result.data ?? []).map(p => ({ id: p.id, licenseTier: p.license_tier,
    beatTitle: (Array.isArray(p.beats) ? p.beats[0]?.title : (p.beats as unknown as { title?: string } | null)?.title) || '' }));
}

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ error: 'Inicia sesión con un correo verificado.' }, { status: 401 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!body || !uuid(body.passId) || (!body.quoteOnly && !uuid(body.idempotencyKey))) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
  const db = createCommerceAdminClient();
  try {
    const facts = JSON.stringify({ passId: body.passId, giftPass: Boolean(body.giftPass), recipientMode: body.recipientMode ?? 'self',
      recipientKind: body.recipientKind ?? null, recipientEmail: (body.recipientEmail ?? '').trim().toLowerCase(), recipientArtistSlug: body.recipientArtistSlug ?? '',
      items: (body.items ?? []).map(i => ({ beatId: i.beatId, licenseTier: i.licenseTier })) });
    let prior = null;
    if (!body.quoteOnly) {
      const lookup = await db.from('commerce_checkout_intents').select('id,snapshot,state,stripe_checkout_session_id')
        .eq('buyer_auth_user_id', user.id).eq('beat_pass_request_key', body.idempotencyKey).maybeSingle();
      if (lookup.error) throw new Error('No se pudo consultar la operación.');
      prior = lookup.data;
      if (prior && prior.snapshot.requestFacts !== facts) return NextResponse.json({ error: 'Esta solicitud pertenece a otra operación.' }, { status: 409 });
    }
    const passResult = await db.from('rg_beat_passes').select('id,user_id,product_key,product_version,status,reserved_intent_id').eq('id', body.passId).maybeSingle();
    const pass = passResult.data;
    // A completed gift may have moved ownership. Only its frozen original buyer can retry it.
    if (passResult.error || !pass || (pass.user_id !== user.id && !(prior?.state === 'fulfilled' && prior.snapshot.utility.passId === pass.id))) return NextResponse.json({ error: 'Pase no disponible para esta cuenta.' }, { status: 404 });
    const catalog = await db.from('rg_market_products').select('*').eq('product_key', pass.product_key).eq('version', pass.product_version).single();
    if (catalog.error || !catalog.data) throw new Error('No se pudo validar el producto.');
    const product = readMarketProduct(catalog.data);
    // Activation controls new purchases; already-issued entitlements remain valid.
    if (!prior && pass.status !== 'available') return NextResponse.json({ error: 'Este pase ya está reservado o consumido.' }, { status: 409 });
    if (body.giftPass && (body.recipientMode !== 'gift' || !product.giftable || (body.items?.length ?? 0) !== 0)) throw new Error('Regalo de pase no válido.');
    const recipient = prior ? null : await resolveGiftRecipient(db, body);
    let items: Awaited<ReturnType<typeof resolveAuthoritativeCart>>['items'] = prior?.snapshot.items ?? [];
    let remainingCents = Number(prior?.snapshot.totalAmountCents ?? 0); let discountCents = Number(prior?.snapshot.utility.discountCents ?? 0);
    if (!prior && !body.giftPass && product.benefitKind !== 'studio') {
      if (!Array.isArray(body.items) || body.items.length !== 1) throw new Error('Usa un solo pase para una sola licencia elegible.');
      const cart = await resolveAuthoritativeCart(body.items);
      const line = cart.items[0];
      const cents = Math.round(line.unitPrice * 100);
      ({ remainingCents, discountCents } = calculateTicketPayment(product, line.licenseTier, cents));
      items = [{ ...line, catalogUnitPrice: line.unitPrice, unitPrice: remainingCents / 100 }];
    } else if (!prior && (body.items?.length ?? 0) !== 0) throw new Error('Este pase no se aplica a un carrito de beats.');
    if (body.quoteOnly) return NextResponse.json({ remainingCents, discountCents, passName: product.name }, { headers: { 'Cache-Control': 'private, no-store' } });
    if (remainingCents > 0 && !isStripeConfigured()) throw new Error('El pago con Stripe no está disponible.');
    let intent = prior;
    if (!intent) {
      const created = await db.from('commerce_checkout_intents').insert({ id: randomUUID(), buyer_auth_user_id: user.id,
        buyer_email: user.email, ...recipient, beat_pass_request_key: body.idempotencyKey,
        snapshot: { version: 1, kind: 'rg_market', paymentMethod: 'rg_market', requestFacts: facts,
          siteOrigin: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin, items, currency: 'usd', totalAmountCents: remainingCents,
          utility: { passId: pass.id, productKey: product.productKey, version: product.version, benefitKind: product.benefitKind,
            name: product.name, studioDays: product.studioDays, giftPass: Boolean(body.giftPass), discountCents } },
      }).select('id,snapshot,state,stripe_checkout_session_id').single();
      if (created.error || !created.data) throw new Error('No se pudo preparar la operación. Reintenta con la misma solicitud.');
      intent = created.data;
    }
    if (['failed', 'expired', 'refunded', 'disputed', 'needs_review'].includes(intent.state)) return NextResponse.json({ error: 'Esta operación está cerrada. Consulta tu wallet antes de comenzar otra.' }, { status: 409 });
    if (!(intent.state === 'fulfilled' && body.giftPass && product.benefitKind !== 'studio')) {
      const reserved = await db.rpc('rg_reserve_market_pass', { p_user_id: user.id, p_pass_id: pass.id, p_intent_id: intent.id });
      if (reserved.error) return NextResponse.json({ error: 'El pase cambió de estado. Consulta tu wallet.', intentId: intent.id }, { status: 409 });
    }
    // Frozen cents always win on retries, even if catalog USD prices changed later.
    const amount = Number(intent.snapshot.totalAmountCents);
    if (amount > 0) {
      const stripe = getStripe();
      const session = intent.stripe_checkout_session_id ? await stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id)
        : await stripe.checkout.sessions.create({ mode: 'payment', ui_mode: 'embedded', redirect_on_completion: 'never', customer_email: user.email,
          client_reference_id: intent.id, metadata: { type: 'rg_market', commerceIntentId: intent.id, customerEmail: user.email },
          line_items: [{ price_data: { currency: 'usd', unit_amount: amount, product_data: { name: `${intent.snapshot.items[0].beatTitle} · ${intent.snapshot.utility.name}` } }, quantity: 1 }],
        }, { idempotencyKey: `rg-market-intent:${intent.id}` });
      if (session.payment_status === 'paid') {
        const result = await fulfillStripeCheckoutSession(session);
        if (result.status !== 'fulfilled') throw new Error('Payment fulfillment is not complete.');
        return NextResponse.json({ ...result, intentId: intent.id, totalAmount: amount / 100,
          purchases: await completedPurchases(db, result.orderId, body.recipientMode === 'gift') }, { headers: { 'Cache-Control': 'private, no-store' } });
      }
      if (session.status === 'expired') {
        await db.from('commerce_checkout_intents').update({ state: 'expired' }).eq('id', intent.id).is('verified_paid_at', null);
        await db.rpc('rg_release_market_pass', { p_user_id: user.id, p_intent_id: intent.id });
        return NextResponse.json({ error: 'El pago venció y el ticket volvió a tu wallet.' }, { status: 409 });
      }
      const link = await db.from('commerce_checkout_intents').update({ stripe_checkout_session_id: session.id }).eq('id', intent.id);
      if (link.error) throw new Error('Pago preparado; reintenta esta misma operación.');
      return NextResponse.json({ clientSecret: session.client_secret, sessionId: session.id, intentId: intent.id, totalAmount: amount / 100,
        discountCents: intent.snapshot.utility.discountCents }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const session = { id: `rgmarket:${intent.id}`, payment_status: 'paid', amount_total: 0, currency: 'usd', payment_intent: null, customer: null,
      customer_details: { email: user.email }, metadata: { type: 'rg_market', commerceIntentId: intent.id, customerEmail: user.email } } as unknown as Stripe.Checkout.Session;
    const result = await fulfillStripeCheckoutSession(session);
    if (result.status !== 'fulfilled') throw new Error('La operación requiere revisión.');
    return NextResponse.json({ ...result, intentId: intent.id, totalAmount: 0,
      purchases: await completedPurchases(db, result.orderId, body.recipientMode === 'gift') }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[RG Market checkout]', error instanceof Error ? error.message : 'FAILED');
    return NextResponse.json({ error: 'No se pudo completar la operación. Reintenta la misma solicitud; tu pase no se consumirá dos veces.' }, { status: 503 });
  }
}
