import type { CloudMetadata } from './projectRepository';

/** A damaged slot must not make the other slot, or the whole account, unreadable. */
export function decodeProjectManifest(body: Buffer | null): {
  project: CloudMetadata | null; damaged: boolean; notice?: string;
} {
  if (!body) return { project: null, damaged: false };
  try {
    const value = JSON.parse(body.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid manifest');
    const notice = typeof value.recoveryNotice === 'string' ? value.recoveryNotice : undefined;
    if (value.deleted === true) return { project: null, damaged: false, notice };
    if (!Array.isArray(value.tracks) || value.tracks.some((track: { id?: unknown; clips?: unknown }) =>
      !track || typeof track.id !== 'string' || !Array.isArray(track.clips))) throw new Error('Invalid tracks');
    if (value.beat != null && (typeof value.beat !== 'object' || Array.isArray(value.beat))) throw new Error('Invalid beat');
    if (value.tracks.some((track: { clips: { id?: unknown }[] }) => track.clips.some(clip =>
      !clip || typeof clip.id !== 'string'))) throw new Error('Invalid clips');
    return { project: value, damaged: false, notice };
  } catch {
    return { project: null, damaged: true,
      notice: 'Se perdió la información de un respaldo. Tu proyecto local se conserva; puedes continuar.' };
  }
}

/** Only retry transport failures. Permissions and configuration require a repair. */
export function projectServiceError(error: unknown) {
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  const permanent = ['AccessDenied', 'InvalidAccessKeyId', 'InvalidArgument', 'SignatureDoesNotMatch', 'NoSuchBucket'].includes(failure?.name || '')
    || [401, 403].includes(failure?.$metadata?.httpStatusCode || 0);
  return {
    error: permanent ? 'La conexión de nube requiere corregir su configuración. Tu proyecto local se conserva.'
      : 'No se pudo conectar con la nube. Tu proyecto local se conserva.',
    code: permanent ? 'STORAGE_CONFIGURATION' : 'SERVICE_UNAVAILABLE',
    retryable: !permanent,
  };
}
