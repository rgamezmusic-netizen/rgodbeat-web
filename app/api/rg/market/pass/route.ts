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
  let body: { idempotencyKey?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 400 }); }
  if (typeof body.idempotencyKey !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.idempotencyKey)) {
    return NextResponse.json({ error: 'No se pudo validar la solicitud de compra.' }, { status: 400 });
  }
  const admin = createCommerceAdminClient();
  const { data: config, error: configError } = await admin.from('rg_economy_config')
    .select('beat_pass_enabled,beat_pass_cost_rg').eq('id', true).single();
  if (configError || !config) return NextResponse.json({ error: 'RG Market no está disponible.' }, { status: 503 });
  if (!config.beat_pass_enabled) return NextResponse.json({ error: 'El RG Beat Pass todavía no está disponible.' }, { status: 503 });
  const { data: passId, error } = await admin.rpc('rg_purchase_beat_pass', {
    p_user_id: user.id, p_request_key: body.idempotencyKey,
  });
  if (error || typeof passId !== 'string') {
    if (error?.message.includes('insufficient_rg_balance')) return NextResponse.json({ error: 'No tienes suficiente RG para comprar este pase.' }, { status: 409 });
    return NextResponse.json({ error: 'No se pudo procesar el RG Beat Pass. Inténtalo de nuevo.' }, { status: 503 });
  }
  try {
    const wallet = await getRgWalletSummary(user.id);
    return NextResponse.json({ passId, balanceRg: wallet.balanceRg, availableBeatPasses: wallet.availableBeatPasses,
      costRg: Number(config.beat_pass_cost_rg) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ passId, costRg: Number(config.beat_pass_cost_rg) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
}
