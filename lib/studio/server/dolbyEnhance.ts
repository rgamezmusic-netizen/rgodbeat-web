import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const DOLBY_AUTH_URL = 'https://api.dolby.io/v1/auth/token';
const DOLBY_INPUT_URL = 'https://api.dolby.com/media/input';
const DOLBY_ENHANCE_URL = 'https://api.dolby.com/media/enhance';
const DOLBY_OUTPUT_URL = 'https://api.dolby.com/media/output';

let cachedToken: { value: string; expiresAt: number } | null = null;

export type DolbyEnhanceMode = 'vocal' | 'master';

/**
 * Checks whether Dolby.io Media Enhance credentials are configured in the environment.
 * Supports either OAuth2 App credentials (DOLBY_APP_KEY + DOLBY_APP_SECRET)
 * or a direct API key / Bearer token (DOLBY_API_KEY).
 */
export function isDolbyEnhanceConfigured(): boolean {
  if (process.env.ENABLE_DOLBY_ENHANCE !== 'true') return false;
  const appKey = process.env.DOLBY_APP_KEY?.trim();
  const appSecret = process.env.DOLBY_APP_SECRET?.trim();
  const apiKey = process.env.DOLBY_API_KEY?.trim();
  return Boolean((appKey && appSecret) || apiKey);
}

async function getDolbyAuthHeaders(): Promise<Record<string, string> | null> {
  const appKey = process.env.DOLBY_APP_KEY?.trim();
  const appSecret = process.env.DOLBY_APP_SECRET?.trim();

  if (appKey && appSecret) {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAt > now + 30_000) {
      return { Authorization: `Bearer ${cachedToken.value}` };
    }

    const credentials = Buffer.from(`${appKey}:${appSecret}`, 'utf8').toString('base64');
    const response = await fetch(DOLBY_AUTH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Dolby OAuth token request failed with status ${response.status}`);
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new Error('Dolby OAuth response missing access_token');
    }

    const ttlMs = Math.max(60, Number(data.expires_in) || 3600) * 1000;
    cachedToken = {
      value: data.access_token,
      expiresAt: now + ttlMs,
    };

    return { Authorization: `Bearer ${data.access_token}` };
  }

  const apiKey = process.env.DOLBY_API_KEY?.trim();
  if (!apiKey) return null;

  if (apiKey.startsWith('Bearer ')) {
    return { Authorization: apiKey };
  }
  if (apiKey.startsWith('eyJ')) {
    return { Authorization: `Bearer ${apiKey}` };
  }
  return { 'x-api-key': apiKey };
}

/**
 * Builds the optimal Dolby.io Media Enhance configuration for the given position in the audio chain:
 * - 'vocal': Applied to the dry/tuned vocal stem BEFORE spatial effects (Reverb/Delay) and BEFORE mixing with the beat.
 *   Eliminates mobile microphone hiss, room acoustics, plosives ("p"/"b"), mouth clicks, and harsh sibilance ("s")
 *   while leveling vocal dynamics without touching the instrumental beat.
 * - 'master': Applied to a complete vocal + beat mix when pre-stem enhancement was skipped.
 */
function buildEnhancePayload(inputUri: string, outputUri: string, mode: DolbyEnhanceMode) {
  if (mode === 'vocal') {
    return {
      input: inputUri,
      output: outputUri,
      content: {
        type: 'voice_recording',
      },
      audio: {
        noise: {
          reduction: {
            enable: true,
            amount: 'auto',
          },
        },
        dynamics: {
          range_control: {
            enable: true,
            amount: 'medium',
          },
        },
        speech: {
          sibilance: {
            reduction: {
              enable: true,
              amount: 'medium',
            },
          },
          plosive: {
            reduction: {
              enable: true,
              amount: 'high',
            },
          },
          click: {
            reduction: {
              enable: true,
              amount: 'medium',
            },
          },
        },
      },
    };
  }

  return {
    input: inputUri,
    output: outputUri,
    content: {
      type: 'music',
    },
    audio: {
      noise: {
        reduction: {
          enable: true,
          amount: 'low',
        },
      },
      speech: {
        sibilance: {
          reduction: {
            enable: true,
            amount: 'medium',
          },
        },
        plosive: {
          reduction: {
            enable: true,
            amount: 'medium',
          },
        },
      },
    },
  };
}

/**
 * Enhances a WAV buffer via Dolby.io Media Enhance API.
 * Never throws: if Dolby.io is unconfigured, unreachable, or times out, returns null
 * so the caller transparently falls back to RGodbeat's native studio DSP engine.
 */
export async function enhanceAudioWithDolby(
  wavBuffer: Buffer,
  mode: DolbyEnhanceMode = 'vocal'
): Promise<Buffer | null> {
  if (!isDolbyEnhanceConfigured() || wavBuffer.byteLength < 1024) {
    return null;
  }

  try {
    const authHeaders = await getDolbyAuthHeaders();
    if (!authHeaders) return null;

    const jobTag = randomUUID();
    const inputUri = `dlb://in/rgodbeat-${mode}-${jobTag}.wav`;
    const outputUri = `dlb://out/rgodbeat-${mode}-${jobTag}.wav`;

    // 1. Request temporary pre-signed upload URL from Dolby staging storage
    const inputRes = await fetch(DOLBY_INPUT_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ url: inputUri }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });

    if (!inputRes.ok) {
      console.warn('[Dolby.io Enhance] Input allocation failed:', inputRes.status);
      return null;
    }

    const inputData = (await inputRes.json()) as { url?: string };
    if (!inputData.url) return null;

    // 2. Upload WAV buffer to Dolby pre-signed storage URL
    const uploadRes = await fetch(inputData.url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(wavBuffer.byteLength),
      },
      body: new Uint8Array(wavBuffer),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });

    if (!uploadRes.ok) {
      console.warn('[Dolby.io Enhance] Input upload failed:', uploadRes.status);
      return null;
    }

    // 3. Start the Dolby.io Media Enhance processing job
    const enhanceRes = await fetch(DOLBY_ENHANCE_URL, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildEnhancePayload(inputUri, outputUri, mode)),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });

    if (!enhanceRes.ok) {
      console.warn('[Dolby.io Enhance] Job start failed:', enhanceRes.status);
      return null;
    }

    const enhanceData = (await enhanceRes.json()) as { job_id?: string };
    if (!enhanceData.job_id) return null;

    // 4. Poll job status until Success (up to ~45 seconds)
    const maxAttempts = 36;
    let succeeded = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1250));

      const statusRes = await fetch(
        `${DOLBY_ENHANCE_URL}?job_id=${encodeURIComponent(enhanceData.job_id)}`,
        {
          method: 'GET',
          headers: {
            ...authHeaders,
            Accept: 'application/json',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!statusRes.ok) continue;

      const statusData = (await statusRes.json()) as { status?: string };
      if (statusData.status === 'Success') {
        succeeded = true;
        break;
      }
      if (statusData.status === 'Failed' || statusData.status === 'InternalError') {
        console.warn('[Dolby.io Enhance] Job reported failure:', statusData.status);
        return null;
      }
    }

    if (!succeeded) {
      console.warn('[Dolby.io Enhance] Polling timed out');
      return null;
    }

    // 5. Download the enhanced WAV from Dolby output staging
    const outputRes = await fetch(
      `${DOLBY_OUTPUT_URL}?url=${encodeURIComponent(outputUri)}`,
      {
        method: 'GET',
        headers: authHeaders,
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!outputRes.ok) {
      console.warn('[Dolby.io Enhance] Output download failed:', outputRes.status);
      return null;
    }

    const enhancedArrayBuffer = await outputRes.arrayBuffer();
    if (enhancedArrayBuffer.byteLength < 1024) return null;

    return Buffer.from(enhancedArrayBuffer);
  } catch (error) {
    console.warn('[Dolby.io Enhance] Fallback to native DSP:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Enhances a local WAV file on disk in-place (used by the server-side YouTube rendering pipeline).
 * Returns true if enhanced by Dolby.io, or false if left unchanged.
 */
export async function enhanceAudioFileOnDisk(
  filePath: string,
  mode: DolbyEnhanceMode = 'master'
): Promise<boolean> {
  if (!isDolbyEnhanceConfigured()) return false;
  try {
    const original = await readFile(filePath);
    const enhanced = await enhanceAudioWithDolby(original, mode);
    if (!enhanced || enhanced.byteLength < 1024) return false;
    await writeFile(filePath, enhanced);
    return true;
  } catch {
    return false;
  }
}

