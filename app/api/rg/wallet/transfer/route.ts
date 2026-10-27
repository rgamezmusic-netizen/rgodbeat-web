import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { hasVerifiedEmail } from '@/lib/commerce/authorization';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { walletSameOrigin, walletRequestKey } from '@/lib/rg/wallet-request';

export async function POST(request: NextRequest) {
  if (!walletSameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!hasVerifiedEmail(user)) return NextResponse.json({ error: 'Inicia sesión con un correo verificado.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!walletRequestKey(body?.idempotencyKey) || !Number.isSafeInteger(body?.amountRg) || body.amountRg <= 0
    || typeof body.artistSlug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.artistSlug)) {
    return NextResponse.json({ error: 'Selecciona un artista y una cantidad entera de RG.' }, { status: 400 });
  }
  const { data, error } = await createCommerceAdminClient().rpc('rg_transfer_wallet', {
    p_sender_id: user.id, p_artist_slug: body.artistSlug, p_amount_rg: body.amountRg, p_request_key: body.idempotencyKey,
  });
  if (error || !data) {
    const insufficient = error?.message.includes('insufficient_rg');
    return NextResponse.json({ error: insufficient ? 'No tienes suficientes RG para este envío.' : 'No se pudo confirmar el envío. Reintenta la misma operación.' }, { status: insufficient ? 409 : 503 });
  }
  return NextResponse.json({ transferId: data, amountRg: body.amountRg }, { headers: { 'Cache-Control': 'private, no-store' } });
}
