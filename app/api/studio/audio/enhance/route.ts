import { NextRequest, NextResponse } from 'next/server';
import {
  enhanceAudioWithDolby,
  isDolbyEnhanceConfigured,
  type DolbyEnhanceMode,
} from '@/lib/studio/server/dolbyEnhance';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ENHANCE_BYTES = 64 * 1024 * 1024; // 64 MB max WAV payload

export async function GET() {
  const provider = isDolbyEnhanceConfigured() ? 'dolby' : null;
  return NextResponse.json(
    {
      configured: Boolean(provider),
      provider,
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(request: NextRequest) {
  if (!isDolbyEnhanceConfigured()) {
    return new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_ENHANCE_BYTES) {
      return NextResponse.json(
        { error: 'El archivo de audio supera el tamaño máximo para procesamiento IA.' },
        { status: 413, headers: { 'Cache-Control': 'private, no-store' } }
      );
    }

    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength < 1024 || arrayBuffer.byteLength > MAX_ENHANCE_BYTES) {
      return new NextResponse(null, {
        status: 204,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const modeParam = request.nextUrl.searchParams.get('mode');
    const mode: DolbyEnhanceMode = modeParam === 'master' ? 'master' : 'vocal';

    const enhanced = await enhanceAudioWithDolby(Buffer.from(arrayBuffer), mode);
    if (!enhanced) {
      return new NextResponse(null, {
        status: 204,
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    return new NextResponse(new Uint8Array(enhanced), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'X-Dolby-Enhanced': 'true',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}

