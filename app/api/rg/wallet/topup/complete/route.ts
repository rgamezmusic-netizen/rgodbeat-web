import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { walletSameOrigin } from '@/lib/rg/wallet-request';
import { fulfillRgTopup } from '@/lib/rg/wallet-payments';
import { getStripe } from '@/lib/stripe/server';

export async function POST(request: NextRequest) {
  if (!walletSameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para consultar tu compra.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.sessionId !== 'string' || !/^cs_[a-zA-Z0-9_]{5,250}$/.test(body.sessionId)) return NextResponse.json({ error: 'Compra no válida.' }, { status: 400 });
  try {
    const topup = await createCommerceAdminClient().from('rg_wallet_topups').select('id').eq('stripe_session_id', body.sessionId).eq('user_id', user.id).maybeSingle();
    if (topup.error || !topup.data) return NextResponse.json({ error: 'No se encontró esta compra en tu cuenta.' }, { status: 404 });
    const session = await getStripe().checkout.sessions.retrieve(body.sessionId);
    if (session.payment_status !== 'paid') return NextResponse.json({ pending: true }, { status: 202 });
    return NextResponse.json(await fulfillRgTopup(session), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'El abono está pendiente de confirmación. Consulta el estado antes de volver a pagar.' }, { status: 503 }); }
}
