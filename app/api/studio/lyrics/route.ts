import { NextRequest, NextResponse } from 'next/server';
import {
  isGeminiConfigured,
  transcribeLyricsWithGemini,
} from '@/lib/studio/server/geminiLyrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB max

export async function GET() {
  return NextResponse.json(
    {
      configured: isGeminiConfigured(),
      provider: 'google-gemini',
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(request: NextRequest) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: 'La API de Google Gemini no está configurada en el servidor (falta GEMINI_API_KEY).' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    let audioBuffer: Buffer;
    let mimeType = 'audio/wav';
    let artistName: string | undefined;
    let beatTitle: string | undefined;
    let beatGenre: string | undefined;
    let startOffsetSec = 0;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'No se envió archivo de audio.' }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
      mimeType = file.type || 'audio/wav';
      artistName = formData.get('artistName')?.toString();
      beatTitle = formData.get('beatTitle')?.toString();
      beatGenre = formData.get('beatGenre')?.toString();
      startOffsetSec = Number(formData.get('startOffsetSec')) || 0;
    } else {
      const arrayBuffer = await request.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
      mimeType = contentType.split(';')[0].trim() || 'audio/wav';
      artistName = request.headers.get('x-artist-name') || undefined;
      beatTitle = request.headers.get('x-beat-title') || undefined;
      beatGenre = request.headers.get('x-beat-genre') || undefined;
      startOffsetSec = Number(request.headers.get('x-start-offset-sec')) || 0;
    }

    if (audioBuffer.byteLength < 1000) {
      return NextResponse.json({ error: 'El archivo de audio es demasiado pequeño o está vacío.' }, { status: 400 });
    }

    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'El archivo de audio supera los 25 MB permitidos.' },
        { status: 413 }
      );
    }

    const result = await transcribeLyricsWithGemini(
      audioBuffer,
      mimeType,
      {
        artistName,
        beatTitle,
        beatGenre,
      },
      startOffsetSec
    );

    if (!result || result.segments.length === 0) {
      return NextResponse.json(
        {
          error: 'No se pudo detectar voz o letra inteligible en la grabación.',
          segments: [],
          fullLyrics: '',
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        segments: result.segments,
        fullLyrics: result.fullLyrics,
        srtContent: result.srtContent,
        model: result.model,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err: unknown) {
    console.error('[API Lyrics] Error procesando transcripción:', err);
    const message = err instanceof Error ? err.message : null;
    return NextResponse.json(
      { error: message || 'Error interno procesando la lírica.' },
      { status: 500 }
    );
  }
}

