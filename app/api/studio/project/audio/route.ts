import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/storage/r2';
import { canReadProjectAudio } from '@/lib/studio/server/projectAudioAccess';
import { r2ProjectStorage } from '@/lib/studio/server/r2ProjectStorage';

export const dynamic = 'force-dynamic';

/** Download only audio referenced by this account's current Studio project. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para recuperar tus voces.' }, { status: 401 });
  const key = request.nextUrl.searchParams.get('key');
  const prefix = `studio/projects/${user.id}/`;
  if (!key?.startsWith(prefix)) return NextResponse.json({ error: 'Audio no disponible.' }, { status: 404 });
  try {
    const saved = await r2ProjectStorage.read(`${prefix}project.json`);
    if (!saved.body) return NextResponse.json({ error: 'Proyecto no disponible.' }, { status: 404 });
    const project = JSON.parse(saved.body.toString('utf8'));
    if (!canReadProjectAudio(project, key, prefix)) {
      return NextResponse.json({ error: 'Audio no disponible.' }, { status: 404 });
    }
    const client = getR2Client();
    if (!client) throw new Error('R2 unavailable');
    const object = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    if (!object.Body) throw new Error('Audio missing');
    return new Response(object.Body.transformToWebStream() as ReadableStream, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, no-store',
        ...(object.ContentLength !== undefined ? { 'Content-Length': String(object.ContentLength) } : {}),
      },
    });
  } catch (error) {
    console.error('[Studio project audio GET]', error);
    return NextResponse.json({ error: 'No se pudo recuperar el audio. El respaldo se conserva.' }, { status: 503 });
  }
}
