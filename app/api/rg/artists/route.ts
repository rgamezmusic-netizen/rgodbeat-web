import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createOwnedArtist, getOwnedArtist, serializeIdentityError } from '@/lib/rg/identity';

export const dynamic = 'force-dynamic';
const sameOrigin = (request: NextRequest) => !request.headers.get('origin') || request.headers.get('origin') === request.nextUrl.origin;
const allowedKeys = (body: unknown, allowed: string[]) => !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).every(key => allowed.includes(key));

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para consultar tu RG Artist.' }, { status: 401 });
  try {
    const artist = await getOwnedArtist(user.id);
    return NextResponse.json({ artist }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const result = serializeIdentityError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para crear tu RG Artist.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!allowedKeys(body, ['stageName', 'bio'])) return NextResponse.json({ error: 'Los datos del RG Artist no son válidos.' }, { status: 400 });
  try {
    const artist = await createOwnedArtist(user.id, body as { stageName: unknown; bio?: unknown });
    return NextResponse.json({ artist }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const result = serializeIdentityError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
}
