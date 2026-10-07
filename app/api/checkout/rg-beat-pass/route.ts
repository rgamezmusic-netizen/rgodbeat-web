import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/auth/server';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { hasVerifiedEmail } from '@/lib/commerce/authorization';
import { canCheckoutRecipientMode } from '@/lib/commerce/gift-feature';
import { fulfillStripeCheckoutSession, resolveAuthoritativeCart } from '@/lib/commerce/fulfillment';
import type { CheckoutItemPayload } from '@/types/commerce';
import type Stripe from 'stripe';
import { calculateTicketPayment, readMarketProduct } from '@/lib/rg/product/catalog';

export const dynamic = 'force-dynamic';
const sameOrigin = (request: NextRequest) => !request.headers.get('origin') || request.headers.get('origin') === request.nextUrl.origin;
type RecipientMode = 'self' | 'gift';
type RecipientKind = 'artist' | 'email';
type RequestBody = {
  idempotencyKey?: unknown; items?: CheckoutItemPayload[]; recipientMode?: RecipientMode;
  recipientKind?: RecipientKind; recipientEmail?: string; recipientArtistSlug?: string;
};

function factsSignature(body: RequestBody, artistId: string | null, email: string | null) {
  return JSON.stringify({ mode: body.recipientMode || 'self', kind: body.recipientMode === 'gift' ? body.recipientKind : null,
    artistId, email, items: (body.items || []).map(item => ({ beatId: item.beatId, licenseTier: item.licenseTier })) });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ error: 'Inicia sesión con un correo verificado para usar RG Beat Pass.' }, { status: 401 });
  let body: RequestBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 }); }
  const requestKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
  if (!/^[0-9a-f-]{36}$/i.test(requestKey)) return NextResponse.json({ error: 'No se pudo validar el canje.' }, { status: 400 });
  const recipientMode = body.recipientMode || 'self';
  if (!['self', 'gift'].includes(recipientMode) || !Array.isArray(body.items) || body.items.length !== 1) {
    return NextResponse.json({ error: 'RG Beat Pass canjea una licencia elegible por operación.' }, { status: 400 });
  }
  if (recipientMode === 'gift' && !canCheckoutRecipientMode('gift')) {
    return NextResponse.json({ error: 'Los regalos no están disponibles por el momento.' }, { status: 503 });
  }
  const admin = createCommerceAdminClient() as unknown as SupabaseClient;
  const { data: config, error: configError } = await admin.from('rg_economy_config')
    .select('beat_pass_enabled,beat_pass_cost_rg,beat_pass_eligible_license_tiers').eq('id', true).single();
  if (configError || !config || !config.beat_pass_enabled) return NextResponse.json({ error: 'El canje RG Beat Pass todavía no está disponible.' }, { status: 503 });

  let cart;
  try { cart = await resolveAuthoritativeCart(body.items); }
  catch { return NextResponse.json({ error: 'No se pudo validar el beat y su licencia.' }, { status: 400 }); }
  const line = cart.items[0];
  const eligibleTiers = Array.isArray(config.beat_pass_eligible_license_tiers) ? config.beat_pass_eligible_license_tiers : [];
  if (!eligibleTiers.includes(line.licenseTier) || ['exclusive', 'unlimited', 'stems'].includes(line.licenseTier)) {
    return NextResponse.json({ error: 'Esta licencia no es elegible para RG Beat Pass.' }, { status: 400 });
  }
  const catalog = await admin.from('rg_market_products').select('*').eq('product_key', 'beat_pass').eq('version', 1).single();
  if (catalog.error || !catalog.data) return NextResponse.json({ error: 'No se pudo validar RG Beat Pass.' }, { status: 503 });
  try { calculateTicketPayment(readMarketProduct(catalog.data), line.licenseTier, Math.round(line.unitPrice * 100)); }
  catch { return NextResponse.json({ error: 'Esta licencia supera el beneficio estándar de RG Beat Pass.' }, { status: 400 }); }

  let recipientKind: RecipientKind | null = null;
  let recipientEmail: string | null = null;
  let recipientArtistId: string | null = null;
  let recipientArtistSlug: string | null = null;
  let artistSnapshot: { stageName: string; slug: string } | null = null;
  if (recipientMode === 'gift') {
    const encryptionKey = Buffer.from(process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY || '', 'base64');
    if (encryptionKey.length !== 32) return NextResponse.json({ error: 'El envío seguro de regalos no está configurado.' }, { status: 503 });
    recipientKind = body.recipientKind || null;
    if (recipientKind === 'email') {
      recipientEmail = (body.recipientEmail || '').trim().toLowerCase();
      if (recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return NextResponse.json({ error: 'Escribe un correo válido para recibir el regalo.' }, { status: 400 });
    } else if (recipientKind === 'artist') {
      recipientArtistSlug = (body.recipientArtistSlug || '').trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipientArtistSlug)) return NextResponse.json({ error: 'Selecciona un RG Artist activo.' }, { status: 400 });
      const { data: rows, error } = await admin.rpc('rg_resolve_gift_artist', { p_slug: recipientArtistSlug });
      const recipient = Array.isArray(rows) ? rows[0] : null;
      if (error || !recipient?.artist_id || !recipient?.user_id || !recipient?.recipient_email) return NextResponse.json({ error: 'Ese RG Artist ya no puede recibir este regalo.' }, { status: 400 });
      const { data: artist, error: artistError } = await admin.from('rg_artists').select('stage_name,slug,status').eq('id', recipient.artist_id).maybeSingle();
      if (artistError || !artist || artist.status !== 'active' || artist.slug !== recipientArtistSlug) return NextResponse.json({ error: 'Ese RG Artist ya no puede recibir este regalo.' }, { status: 400 });
      recipientArtistId = recipient.artist_id;
      artistSnapshot = { stageName: artist.stage_name, slug: artist.slug };
    } else return NextResponse.json({ error: 'Elige RG Artist o correo electrónico.' }, { status: 400 });
  }

  const signature = factsSignature(body, recipientArtistId, recipientEmail);
  const { data: previousIntent, error: lookupError } = await admin.from('commerce_checkout_intents')
    .select('id,buyer_auth_user_id,recipient_mode,recipient_kind,recipient_email,recipient_artist_id,snapshot,state,attempt_count')
    .eq('buyer_auth_user_id', user.id).eq('beat_pass_request_key', requestKey).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'No se pudo recuperar el canje anterior.' }, { status: 503 });
  let intentId: string;
  let snapshot: Record<string, unknown>;
  if (previousIntent) {
    const storedSnapshot = previousIntent.snapshot as Record<string, unknown>;
    if (storedSnapshot.requestFacts !== signature) return NextResponse.json({ error: 'La solicitud de canje ya está vinculada a otros datos.' }, { status: 409 });
    intentId = previousIntent.id;
    snapshot = storedSnapshot;
  } else {
    intentId = randomUUID();
    const frozenItems = cart.items.map(item => ({ ...item, catalogUnitPrice: item.unitPrice, unitPrice: 0 }));
    snapshot = {
      version: 1, kind: 'beat_pass_redemption', paymentMethod: 'rg_beat_pass', requestFacts: signature,
      siteOrigin: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
      recipient: recipientMode === 'self' ? { mode: 'self' } : recipientKind === 'artist'
        ? { mode: 'gift', kind: 'artist', artist: artistSnapshot }
        : { mode: 'gift', kind: 'email' },
      items: frozenItems, listTotalCents: Math.round(cart.totalAmount * 100), totalAmountCents: 0, currency: 'usd',
    };
    const { error } = await admin.from('commerce_checkout_intents').insert({
      id: intentId, buyer_auth_user_id: user.id, buyer_email: user.email,
      recipient_mode: recipientMode, recipient_kind: recipientKind, recipient_email: recipientEmail,
      recipient_artist_id: recipientArtistId, recipient_artist_slug: recipientArtistSlug,
      beat_pass_request_key: requestKey, snapshot, snapshot_version: 1,
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'El canje ya se está procesando. Reintenta la misma solicitud.' }, { status: 409 });
      return NextResponse.json({ error: 'No se pudo iniciar el canje.' }, { status: 503 });
    }
  }

  const { error: reserveError } = await admin.rpc('rg_reserve_next_beat_pass', { p_user_id: user.id, p_intent_id: intentId });
  if (reserveError) {
    if (reserveError.message.includes('rg_beat_pass_unavailable')) return NextResponse.json({ error: 'No tienes un RG Beat Pass disponible.' }, { status: 409 });
    return NextResponse.json({ error: 'No se pudo reservar el RG Beat Pass.' }, { status: 503 });
  }

  const session = {
    id: `rgpass:${intentId}`, payment_status: 'paid', amount_total: 0, currency: 'usd', customer: null,
    customer_details: { email: user.email, name: user.user_metadata?.full_name || user.email.split('@')[0] },
    payment_intent: null, metadata: { type: 'rg_beat_pass', commerceIntentId: intentId },
  } as unknown as Stripe.Checkout.Session;
  try {
    const result = await fulfillStripeCheckoutSession(session);
    const { data: purchases } = await admin.from('purchases').select('id,license_tier,beats(title)').eq('order_id', result.orderId);
    const rows = (purchases || []).map(row => ({ id: row.id, licenseTier: row.license_tier, beatTitle: Array.isArray(row.beats) ? row.beats[0]?.title : (row.beats as { title?: string } | null)?.title || line.beatTitle }));
    return NextResponse.json({ status: result.status, orderId: result.orderId, totalAmount: 0, paymentMethod: 'rg_beat_pass',
      purchases: rows, giftStatus: 'giftStatus' in result ? result.giftStatus : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'El canje no terminó de preparar la licencia. Reintenta esta misma operación; el pase permanece reservado, no consumido.' }, { status: 503 });
  }
}
