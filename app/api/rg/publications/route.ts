import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { serializeIdentityError } from '@/lib/rg/identity';
import { retryConfirmedPublicationLink } from '@/lib/rg/publications';

export const dynamic = 'force-dynamic';
const sameOrigin = (request: NextRequest) => !request.headers.get('origin') || request.headers.get('origin') === request.nextUrl.origin;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Solicitud no válida.' }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para vincular tu publicación.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const allowed = ['artistId', 'trackId', 'beatId', 'youtubeExportJobId'];
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  if (!value || Object.keys(value).some(key => !allowed.includes(key))
    || typeof value.artistId !== 'string' || typeof value.trackId !== 'string' || typeof value.youtubeExportJobId !== 'string'
    || !(value.beatId === null || typeof value.beatId === 'string')) {
    return NextResponse.json({ error: 'Los datos del vínculo RG no son válidos.' }, { status: 400 });
  }
  try {
    const result = await retryConfirmedPublicationLink({
      userId: user.id, artistId: value.artistId, trackId: value.trackId,
      beatId: value.beatId as string | null, youtubeExportJobId: value.youtubeExportJobId,
    });
    if (!result.linked) return NextResponse.json({ linked: false, error: result.error, code: result.code }, { status: 409 });
    return NextResponse.json({ linked: true, publicationId: result.publicationId });
  } catch (error) {
    const result = serializeIdentityError(error);
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }
}
