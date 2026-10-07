import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { POST as continueCheckout } from '../route';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const db = createCommerceAdminClient();
  const { data: intent, error } = await db.from('commerce_checkout_intents').select('snapshot,beat_pass_request_key')
    .eq('id', typeof body?.intentId === 'string' ? body.intentId : '').eq('buyer_auth_user_id', user.id).maybeSingle();
  if (error || !intent || intent.snapshot?.paymentMethod !== 'rg_market') return NextResponse.json({ error: 'Operación no disponible.' }, { status: 404 });
  try {
    const facts = JSON.parse(intent.snapshot.requestFacts);
    return continueCheckout(new NextRequest(new URL('/api/checkout/rg-market', request.nextUrl.origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: request.nextUrl.origin },
      body: JSON.stringify({ ...facts, idempotencyKey: intent.beat_pass_request_key }),
    }));
  } catch { return NextResponse.json({ error: 'No se pudo recuperar esta operación.' }, { status: 409 }); }
}
