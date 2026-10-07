import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { getStripe } from '@/lib/stripe/server';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.intentId !== 'string') return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 });
  const db = createCommerceAdminClient();
  const { data: intent, error } = await db.from('commerce_checkout_intents').select('id,state,snapshot,stripe_checkout_session_id,verified_paid_at')
    .eq('id', body.intentId).eq('buyer_auth_user_id', user.id).maybeSingle();
  if (error || !intent || intent.snapshot.paymentMethod !== 'rg_market') return NextResponse.json({ error: 'Operación no disponible.' }, { status: 404 });
  if (intent.verified_paid_at || !['awaiting_payment', 'expired', 'failed'].includes(intent.state)) return NextResponse.json({ error: 'Este pago ya está en proceso.' }, { status: 409 });
  try {
    // A session-creation/link failure can leave an unlinked real Stripe session.
    // Recreate idempotently before expiring; never release a possibly payable ticket.
    if (Number(intent.snapshot.totalAmountCents) > 0) {
      if (!intent.stripe_checkout_session_id) return NextResponse.json({ error: 'Reintenta primero el pago para confirmar su estado.' }, { status: 409 });
      const stripe = getStripe();
      let session = await stripe.checkout.sessions.retrieve(intent.stripe_checkout_session_id);
      if (session.payment_status === 'paid' || session.status === 'complete') return NextResponse.json({ error: 'El pago ya está confirmado o en proceso.' }, { status: 409 });
      if (session.status === 'open') session = await stripe.checkout.sessions.expire(session.id);
      if (session.status !== 'expired') throw new Error('session_not_expired');
    }
    const closed = await db.from('commerce_checkout_intents').update({ state: 'expired' }).eq('id', intent.id).is('verified_paid_at', null).select('id').maybeSingle();
    if (closed.error || !closed.data) throw new Error('payment_state_changed');
    const released = await db.rpc('rg_release_market_pass', { p_user_id: user.id, p_intent_id: intent.id });
    if (released.error) throw new Error('release_failed');
    return NextResponse.json({ released: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'No se pudo confirmar la cancelación. Consulta tu wallet.' }, { status: 409 }); }
}
