import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createOwnedTrack, getOwnedArtist, listOwnedTracks, serializeIdentityError } from '@/lib/rg/identity';

export const dynamic = 'force-dynamic';
const sameOrigin = (request: NextRequest) => !request.headers.get('origin') || request.headers.get('origin') === request.nextUrl.origin;
const allowedKeys = (body: unknown, allowed: string[]) => !!body && typeof body === 'object' && !Array.isArray(body)
  && Object.keys(body).every(key => allowed.includes(key));

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para consultar tus RG Tracks.' }, { status: 401 });
  try {
    const artistId = request.nextUrl.searchParams.get('artistId');
    const artist = artistId ? { id: artistId } : await getOwnedArtist(user.id);
    if (!artist) return NextResponse.json({ tracks: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    const tracks = await listOwnedTracks(user.id, artist.id);
    return NextResponse.json({ tracks }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const result = serializeIdentityError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para crear un RG Track.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!allowedKeys(body, ['artistId', 'title', 'beatId'])) {
    return NextResponse.json({ error: 'Los datos del RG Track no son válidos.' }, { status: 400 });
  }
  try {
    const track = await createOwnedTrack(user.id, body as { artistId: unknown; title: unknown; beatId?: unknown });
    return NextResponse.json({ track }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const result = serializeIdentityError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
}
