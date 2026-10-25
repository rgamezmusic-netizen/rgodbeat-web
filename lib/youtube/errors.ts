// Only these safe codes/messages leave the server. Never forward Google tokens,
// signed storage URLs, response bodies or ffmpeg output to the Studio.
const failures = {
  channelAuthorization: { status: 503, message: 'YouTube necesita que se vuelva a autorizar el canal RGODBEAT.' },
  channelConfiguration: { status: 503, message: 'La conexión de YouTube necesita una revisión del administrador.' },
  channelMismatch: { status: 503, message: 'La cuenta conectada no corresponde al canal RGODBEAT.' },
  insufficientPermissions: { status: 503, message: 'Faltan permisos de YouTube. El administrador debe volver a autorizar el canal.' },
  youtubeSignupRequired: { status: 503, message: 'La cuenta de Google conectada necesita un canal de YouTube.' },
  forbidden: { status: 503, message: 'YouTube no permite publicar con la autorización actual del canal.' },
  quotaExceeded: { status: 429, message: 'Se alcanzó el límite de YouTube. Vuelve a intentarlo más tarde.' },
  dailyLimitExceeded: { status: 429, message: 'Se alcanzó el límite diario de YouTube. Inténtalo mañana.' },
  uploadLimitExceeded: { status: 429, message: 'El canal alcanzó su límite de subidas de hoy. Inténtalo mañana.' },
  invalidVideoMetadata: { status: 400, message: 'YouTube rechazó los datos del vídeo. Revisa el título y la descripción.' },
  rendererUnavailable: { status: 503, message: 'El conversor de vídeo no está disponible. Puedes descargar tu canción.' },
  renderFailed: { status: 502, message: 'No se pudo crear el vídeo. Puedes descargar tu canción e intentarlo de nuevo.' },
  invalidMaster: { status: 415, message: 'No se pudo leer el audio de la canción. Vuelve a preparar la exportación.' },
  storageUnavailable: { status: 503, message: 'No se pudo acceder al audio temporal. Inténtalo de nuevo.' },
  stagedAudioMissing: { status: 404, message: 'La subida del audio quedó incompleta. Inténtalo de nuevo.' },
  coverUnavailable: { status: 422, message: 'No se pudo abrir la portada. Elige otra imagen e inténtalo de nuevo.' },
  coverTooLarge: { status: 413, message: 'La portada debe pesar menos de 4 MB.' },
  requestTimeout: { status: 504, message: 'La conexión con YouTube tardó demasiado. Comprueba el canal antes de volver a publicar.' },
  processingFailed: { status: 502, message: 'YouTube no pudo procesar el vídeo. Puedes descargar tu canción.' },
  uploadFailed: { status: 502, message: 'YouTube no terminó la publicación. Puedes descargar tu canción e intentarlo de nuevo.' },
} as const;

export type YouTubeFailureCode = keyof typeof failures;

export class YouTubeError extends Error {
  constructor(readonly code: YouTubeFailureCode) { super(code); this.name = 'YouTubeError'; }
}

export function youtubeFailure(error: unknown, fallback: YouTubeFailureCode = 'uploadFailed') {
  const value = error instanceof Error ? error.message : '';
  const code: YouTubeFailureCode = error instanceof YouTubeError ? error.code
    : Object.hasOwn(failures, value) ? value as YouTubeFailureCode
      : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'requestTimeout' : fallback;
  return { code, ...failures[code] };
}

export function googleYouTubeError(payload: unknown, status: number): YouTubeError {
  const body = payload as { error?: { errors?: Array<{ reason?: string }> } } | null;
  const reason = body?.error?.errors?.[0]?.reason || '';
  if (Object.hasOwn(failures, reason)) return new YouTubeError(reason as YouTubeFailureCode);
  if (/^invalid|^empty/.test(reason)) return new YouTubeError('invalidVideoMetadata');
  return new YouTubeError(status === 401 ? 'channelAuthorization' : status === 403 ? 'forbidden' : status === 429 ? 'quotaExceeded' : 'uploadFailed');
}
