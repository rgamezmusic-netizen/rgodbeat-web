import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/storage/r2';
import { canReadProjectAudio } from '@/lib/studio/server/projectAudioAccess';
import { r2ProjectStorage } from '@/lib/studio/server/r2ProjectStorage';
import { decodeProjectManifest } from '@/lib/studio/server/projectManifest';

export const dynamic = 'force-dynamic';

/** Download only audio referenced by one of this account's two retained Studio projects. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para recuperar tus voces.' }, { status: 401 });
  const expectedOwner = request.headers.get('x-studio-owner');
  if (expectedOwner && expectedOwner !== user.email?.toLowerCase()) {
    return NextResponse.json({error:'La cuenta cambió durante la descarga.',code:'SESSION_REQUIRED',retryable:false},{status:401});
  }
  const key = request.nextUrl.searchParams.get('key');
  const slot = request.nextUrl.searchParams.get('slot') === 'previous' ? 'previous-project.json' : 'project.json';
  const prefix = `studio/projects/${user.id}/`;
  if (!key?.startsWith(prefix)) return NextResponse.json({ error: 'Audio no disponible.' }, { status: 404 });
  try {
    const saved = await r2ProjectStorage.read(`${prefix}${slot}`);
    if (!saved.body) return NextResponse.json({ error: 'El respaldo cambió durante la descarga. Vuelve a abrirlo.', code: 'PROJECT_CHANGED' }, { status: 409 });
    const project = decodeProjectManifest(saved.body).project;
    if (!project || !canReadProjectAudio(project, key, prefix)) {
      return NextResponse.json({ error: 'El respaldo cambió durante la descarga. Vuelve a abrirlo.', code: 'PROJECT_CHANGED' }, { status: 409 });
    }
    const client = getR2Client();
    if (!client) throw new Error('R2 unavailable');
    const object = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }), { abortSignal: AbortSignal.timeout(20000) });
    if (!object.Body) throw new Error('Audio missing');
    return new Response(object.Body.transformToWebStream() as ReadableStream, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, no-store',
        ...(object.ContentLength !== undefined ? { 'Content-Length': String(object.ContentLength) } : {}),
      },
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'NoSuchKey') {
      return NextResponse.json({ error: 'Se perdió este audio del respaldo.', code: 'AUDIO_LOST' }, { status: 410 });
    }
    console.error('[Studio project audio GET]', error);
    return NextResponse.json({ error: 'No se pudo recuperar el audio. El respaldo se conserva.' }, { status: 503 });
  }
}
