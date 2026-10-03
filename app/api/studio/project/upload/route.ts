import { createHash } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/storage/r2';
import { r2ProjectStorage } from '@/lib/studio/server/r2ProjectStorage';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const CHUNK_BYTES = 2_000_000;

/** Stages large WAVs using requests below Vercel's function body limit. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión para respaldar tu proyecto.' }, { status: 401 });
  const owner = request.headers.get('x-studio-owner');
  if (owner && owner !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'La cuenta cambió durante la subida.' }, { status: 401 });
  }
  const uploadId = request.nextUrl.searchParams.get('uploadId') || '';
  const hash = request.nextUrl.searchParams.get('hash') || '';
  if (!UUID.test(uploadId) || !HASH.test(hash)) {
    return NextResponse.json({ error: 'Identificador de audio inválido.' }, { status: 400 });
  }
  const prefix = `studio/projects/${user.id}/`;
  const partPrefix = `${prefix}pending/${uploadId}/${hash}/`;
  const partKey = (index: number) => `${partPrefix}${index}`;
  try {
    if (request.nextUrl.searchParams.get('action') !== 'finish') {
      const index = Number(request.nextUrl.searchParams.get('index'));
      if (!Number.isInteger(index) || index < 0 || index >= 128) {
        return NextResponse.json({ error: 'Fragmento inválido.' }, { status: 400 });
      }
      const bytes = Buffer.from(await request.arrayBuffer());
      if (!bytes.length || bytes.length > CHUNK_BYTES) {
        return NextResponse.json({ error: 'El fragmento supera el tamaño admitido.' }, { status: 413 });
      }
      await r2ProjectStorage.put(partKey(index), bytes, 'application/octet-stream');
      return NextResponse.json({ success: true });
    }

    const { parts } = await request.json() as { parts: number };
    if (!Number.isInteger(parts) || parts < 1 || parts > 128) {
      return NextResponse.json({ error: 'Cantidad de fragmentos inválida.' }, { status: 400 });
    }
    const key = `${prefix}snapshots/${uploadId}/${hash}.wav`;
    if (await r2ProjectStorage.hasStaged?.(key, hash)) {
      return NextResponse.json({ success: true, key, hash });
    }
    const fragments: Buffer[] = [];
    for (let start = 0; start < parts; start += 8) {
      const batch = await Promise.all(Array.from({ length: Math.min(8, parts - start) }, (_, offset) =>
        r2ProjectStorage.read(partKey(start + offset))));
      for (const part of batch) {
        if (!part.body?.length || part.body.length > CHUNK_BYTES) {
          return NextResponse.json({ error: 'Falta un fragmento del audio. El proyecto anterior se conserva.' }, { status: 409 });
        }
        fragments.push(part.body);
      }
    }
    const wav = Buffer.concat(fragments);
    if (createHash('sha256').update(wav).digest('hex') !== hash) {
      return NextResponse.json({ error: 'El audio subido está incompleto. Reintenta el respaldo.' }, { status: 422 });
    }
    const client = getR2Client();
    if (!client) throw new Error('R2 unavailable');
    const written = await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME, Key: key, Body: wav,
      ContentType: 'audio/wav', Metadata: { sha256: hash },
    }));
    if (!written.ETag) throw new Error('Audio not confirmed by R2');
    await Promise.allSettled(Array.from({ length: parts }, (_, index) => r2ProjectStorage.remove(partKey(index))));
    return NextResponse.json({ success: true, key, hash });
  } catch (error) {
    console.error('[Studio upload]', error);
    return NextResponse.json({ error: 'No se completó la subida. El proyecto anterior se conserva.' }, { status: 503 });
  }
}
