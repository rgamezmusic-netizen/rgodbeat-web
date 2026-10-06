import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getRgWalletSummary } from '@/lib/rg/product/wallet';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para consultar RG Coin.' }, { status: 401 });
  try {
    return NextResponse.json(await getRgWalletSummary(user.id), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'RG Coin todavía no está disponible.' }, { status: 503 });
  }
}
