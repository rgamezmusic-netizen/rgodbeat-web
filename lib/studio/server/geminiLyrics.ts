/**
 * RGodbeat Studio - Google Gemini Audio Transcription & Lyric Video Engine
 * Transcribes vocal takes to synced lyrics with timestamps (seconds)
 * for lyric videos, video descriptions and interactive subtitles.
 */

export interface LyricSegment {
  start: number; // Start time in seconds (e.g. 1.25)
  end: number;   // End time in seconds (e.g. 4.80)
  text: string;  // Phrase or line of lyrics
}

export interface LyricsTranscriptionResult {
  segments: LyricSegment[];
  fullLyrics: string;
  srtContent: string;
  model: string;
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key.length > 5);
}

/** Formats decimal seconds to SRT timestamp: HH:MM:SS,mmm */
export function secondsToSrtTime(totalSeconds: number): string {
  const safeSec = Math.max(0, totalSeconds);
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = Math.floor(safeSec % 60);
  const millis = Math.floor((safeSec % 1) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/** Converts an array of lyric segments into standard SRT subtitle format */
export function segmentsToSrt(segments: LyricSegment[]): string {
  return segments
    .filter((s) => s.text && s.text.trim().length > 0)
    .sort((a, b) => a.start - b.start)
    .map((s, idx) => {
      const startStr = secondsToSrtTime(s.start);
      const endStr = secondsToSrtTime(Math.max(s.start + 0.5, s.end));
      return `${idx + 1}\n${startStr} --> ${endStr}\n${s.text.trim()}\n`;
    })
    .join('\n');
}

/**
 * Transcribes audio via Google Gemini 3.8 Flash (with fallback to gemini-flash-latest).
 * Accepts raw audio buffer (WAV, MP3, AAC, M4A) and returns synced lyrics segments.
 */
export async function transcribeLyricsWithGemini(
  audioBuffer: Buffer,
  mimeType: string = 'audio/wav',
  contextHint?: { beatTitle?: string; beatGenre?: string; artistName?: string }
): Promise<LyricsTranscriptionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn('[GeminiLyrics] GEMINI_API_KEY no configurada');
    return null;
  }

  // Maximum payload size check (20 MB base64 limit)
  if (audioBuffer.length > 20 * 1024 * 1024) {
    console.warn('[GeminiLyrics] El archivo de audio excede 20MB');
    return null;
  }

  const base64Audio = audioBuffer.toString('base64');

  const modelsToTry = [
    'gemini-flash-lite-latest',
    'gemini-flash-latest',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
  ];

  const prompt = `Eres el transcriptor profesional de líricas de RGodbeat Studio.
Tu misión es escuchar la pista vocal y transcribir la letra en español exactamente como la canta o rapea el artista.
${contextHint?.artistName ? `Artista: ${contextHint.artistName}.` : ''}
${contextHint?.beatGenre ? `Género musical: ${contextHint.beatGenre}.` : ''}
${contextHint?.beatTitle ? `Pista: ${contextHint.beatTitle}.` : ''}

REGLAS OBLIGATORIAS:
1. Transcribe cada frase con su tiempo de inicio (start) y fin (end) exactos en segundos (números decimales, ej: 2.45).
2. Entiende modismos latinos y jerga urbana (trap, reggaetón, hip-hop de PR, Venezuela, Colombia, Chile, México, etc.).
3. No inventes palabras que no se escuchen. Si una parte es instrumental o silencio, omítela.
4. Devuelve ÚNICAMENTE un array JSON válido sin texto adicional ni bloques markdown, con esta estructura:
[
  { "start": 1.20, "end": 4.10, "text": "Primera frase que canta" },
  { "start": 4.25, "end": 7.80, "text": "Segunda frase que canta" }
]`;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType || 'audio/wav',
                    data: base64Audio,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1, // low temperature for maximum transcription fidelity
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(60_000), // 60s max timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.warn(`[GeminiLyrics] Error en modelo ${model} (${response.status}):`, errorText.slice(0, 300));
        continue; // Try next model
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!rawText) continue;

      // Clean possible Markdown fence blocks
      const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      let parsed: any[] = [];
      try {
        parsed = JSON.parse(cleanJson);
      } catch {
        console.warn(`[GeminiLyrics] Respuesta no fue JSON válido en ${model}:`, rawText.slice(0, 150));
        continue;
      }

      if (!Array.isArray(parsed)) continue;

      const segments: LyricSegment[] = parsed
        .map((item: any) => ({
          start: Math.max(0, Number(item.start) || 0),
          end: Math.max(0, Number(item.end) || 0),
          text: String(item.text || '').trim(),
        }))
        .filter((s) => s.text.length > 0 && s.end >= s.start);

      const fullLyrics = segments.map((s) => s.text).join('\n');
      const srtContent = segmentsToSrt(segments);

      return {
        segments,
        fullLyrics,
        srtContent,
        model,
      };
    } catch (err) {
      console.warn(`[GeminiLyrics] Excepción con modelo ${model}:`, err);
    }
  }

  return null;
}

