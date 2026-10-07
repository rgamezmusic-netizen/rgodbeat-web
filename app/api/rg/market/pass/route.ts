import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { getRgWalletSummary } from '@/lib/rg/product/wallet';

export const dynamic = 'force-dynamic';
const sameOrigin = (request: NextRequest) => !request.headers.get('origin') || request.headers.get('origin') === request.nextUrl.origin;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para ver RG Market.' }, { status: 401 });
  try { return NextResponse.json(await getRgWalletSummary(user.id), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return NextResponse.json({ error: 'RG Market no está disponible.' }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para comprar el RG Beat Pass.' }, { status: 401 });
  let body: { idempotencyKey?: unknown; productKey?: unknown; version?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 }); }
  if (typeof body.idempotencyKey !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey)) {
    return NextResponse.json({ error: 'No se pudo validar la solicitud de compra.' }, { status: 400 });
  }
  const admin = createCommerceAdminClient();
  const key = typeof body.productKey === 'string' ? body.productKey : 'beat_pass';
  const version = body.version === undefined ? 1 : body.version;
  if (!Number.isSafeInteger(version) || Number(version) < 1) return NextResponse.json({ error: 'Versión no válida.' }, { status: 400 });
  let product;
  try { product = (await getRgWalletSummary(user.id)).products.find(p => p.productKey === key && p.version === version && p.active); }
  catch { return NextResponse.json({ error: 'RG Market no está disponible.' }, { status: 503 }); }
  if (!product) return NextResponse.json({ error: 'Este producto todavía no está disponible.' }, { status: 503 });
  const { data: passId, error } = await admin.rpc('rg_purchase_market_pass', {
    p_user_id: user.id, p_request_key: body.idempotencyKey, p_product_key: key, p_version: version,
  });
  if (error || typeof passId !== 'string') {
    if (error?.message.includes('insufficient_rg_balance')) return NextResponse.json({ error: 'No tienes suficiente RG gastable para comprar este pase.' }, { status: 409 });
    return NextResponse.json({ error: 'No se pudo comprar el pase. Inténtalo de nuevo.' }, { status: 503 });
  }
  try {
    const wallet = await getRgWalletSummary(user.id);
    return NextResponse.json({ passId, balanceRg: wallet.balanceRg, availableBeatPasses: wallet.availableBeatPasses,
      costRg: product.costRg }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ passId, costRg: product.costRg }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
}
