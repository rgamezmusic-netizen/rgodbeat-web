import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getOwnedTrack, serializeIdentityError, updateOwnedTrack } from '@/lib/rg/identity';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const sameOrigin = (request: NextRequest) => !request.headers.get('origin') || request.headers.get('origin') === request.nextUrl.origin;
const allowedKeys = (body: unknown, allowed: string[]) => !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).every(key => allowed.includes(key));

export async function GET(_request: NextRequest, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para consultar tu RG Track.' }, { status: 401 });
  try {
    const { id } = await params;
    const result = await getOwnedTrack(user.id, id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const result = serializeIdentityError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para editar tu RG Track.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!allowedKeys(body, ['title', 'beatId', 'studioProjectId'])) {
    return NextResponse.json({ error: 'Los datos del RG Track no son válidos.' }, { status: 400 });
  }
  try {
    const { id } = await params;
    const track = await updateOwnedTrack(user.id, id, body as { title?: unknown; beatId?: unknown; studioProjectId?: unknown });
    return NextResponse.json({ track }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const result = serializeIdentityError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
}
