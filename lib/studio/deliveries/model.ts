export const DELIVERY_CHUNK_BYTES = 2_000_000;
export const MAX_DELIVERY_FILE_BYTES = 128_000_000;
export const MAX_DELIVERY_BYTES = 768_000_000;
export const DELIVERY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DELIVERY_HASH = /^[0-9a-f]{64}$/;

export type DeliveryFile = {
  id: string; trackId: string; name: string; filename: string; bytes: number; sha256: string;
  sampleRate: number; channels: number; durationSeconds: number;
  tuning: { rootKey: string; scaleMode: string };
};
export type DeliveryInput = {
  artistName: string; title: string; message: string;
  project: { beatTitle: string; bpm: number; key: string; scale: string; durationSeconds: number };
  files: DeliveryFile[];
};
export type StudioDelivery = DeliveryInput & {
  id: string; ownerId: string; contactEmail: string; createdAt: string; receivedAt: string | null;
  notification: 'pending' | 'sent'; notifiedAt: string | null;
  notificationLeaseUntil?: string | null;
  notificationMessageId?: string | null;
  notificationError?: string | null;
};

export class DeliveryError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeliveryError('Datos de entrega inválidos.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, optional = false): string {
  if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new DeliveryError('Completa los datos de la entrega sin superar los límites indicados.');
  }
  return value.trim();
}
function number(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new DeliveryError('El tempo, la duración o el tamaño del audio no son válidos.');
  }
  return value;
}

/** Whitelist client fields; identity and delivery state always come from the server. */
export function parseDeliveryInput(value: unknown): DeliveryInput {
  const input = object(value), project = object(input.project);
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > 8) throw new DeliveryError('Selecciona entre 1 y 8 pistas de voz.');
  const ids = new Set<string>(), trackIds = new Set<string>();
  const files = input.files.map(value => {
    const file = object(value), tuning = object(file.tuning);
    const id = text(file.id, 36), trackId = text(file.trackId, 100);
    const filename = text(file.filename, 180);
    if (!DELIVERY_UUID.test(id) || ids.has(id) || trackIds.has(trackId) || !/^[\w.-]+\.wav$/i.test(filename) || filename.includes('..') || !DELIVERY_HASH.test(String(file.sha256))) {
      throw new DeliveryError('La identificación de las pistas no es válida.');
    }
    ids.add(id); trackIds.add(trackId);
    return { id, trackId, name: text(file.name, 100), filename, sha256: String(file.sha256),
      bytes: number(file.bytes, 60, MAX_DELIVERY_FILE_BYTES, true),
      sampleRate: number(file.sampleRate, 8000, 192000, true), channels: number(file.channels, 1, 2, true),
      durationSeconds: number(file.durationSeconds, 0.001, 7200),
      tuning: { rootKey: text(tuning.rootKey, 20), scaleMode: text(tuning.scaleMode, 50) } };
  });
  if (files.reduce((sum, file) => sum + file.bytes, 0) > MAX_DELIVERY_BYTES) throw new DeliveryError('La entrega supera los 768 MB. Envía menos pistas a la vez.');
  const result = { artistName: text(input.artistName, 80), title: text(input.title, 120), message: text(input.message, 2000, true),
    project: { beatTitle: text(project.beatTitle, 160), bpm: number(project.bpm, 20, 400),
      key: text(project.key, 60), scale: text(project.scale, 80), durationSeconds: number(project.durationSeconds, 0.001, 7200) }, files };
  if (files.some(file => Math.abs(file.durationSeconds - result.project.durationSeconds) > 1 / file.sampleRate + 0.00001)) {
    throw new DeliveryError('Todas las voces deben tener la misma duración y comenzar en 0:00.');
  }
  return result;
}

/** Exact header emitted by the Studio's 32-bit float WAV encoder, including its fact chunk. */
export function validateDeliveryWav(header: Uint8Array, file: DeliveryFile): void {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const ascii = (offset: number, length: number) => String.fromCharCode(...header.subarray(offset, offset + length));
  if (header.length < 56 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE' || ascii(12, 4) !== 'fmt '
    || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 3 || view.getUint16(34, true) !== 32
    || ascii(36, 4) !== 'fact' || view.getUint32(40, true) !== 4 || ascii(48, 4) !== 'data'
    || view.getUint32(4, true) !== file.bytes - 8 || view.getUint32(52, true) !== file.bytes - 56
    || view.getUint16(22, true) !== file.channels || view.getUint32(24, true) !== file.sampleRate
    || view.getUint16(32, true) !== file.channels * 4 || view.getUint32(28, true) !== file.sampleRate * file.channels * 4
    || view.getUint32(44, true) !== (file.bytes - 56) / (file.channels * 4)
    || Math.abs((file.bytes - 56) / (file.sampleRate * file.channels * 4) - file.durationSeconds) > 1 / file.sampleRate) {
    throw new DeliveryError('El WAV no coincide con los datos de la pista. Vuelve a generar la entrega.', 422);
  }
}

export function deliveryReadme(delivery: StudioDelivery): string {
  return ['RGODBEAT — ENTREGA DE VOCES RAW', `Entrega: ${delivery.id}`, `Artista: ${delivery.artistName}`,
    `Tema: ${delivery.title}`, `Contacto: ${delivery.contactEmail}`, `Beat: ${delivery.project.beatTitle}`,
    `Tempo del proyecto: ${delivery.project.bpm} BPM`, `Tono del proyecto: ${delivery.project.key}`,
    `Escala del proyecto: ${delivery.project.scale}`, `Duración: ${delivery.project.durationSeconds.toFixed(3)} segundos`,
    'Inicio de todas las pistas: 00:00.000. Importar juntas en el mismo punto de la sesión.',
    'Formato: WAV 32-bit float. Frecuencia de muestreo indicada por archivo. Sin efectos de exportación.',
    'El tono y el tempo son los valores configurados por el artista; no son una nueva medición del audio.',
    'RAW no elimina el ruido presente en la grabación.', '', ...delivery.files.map(file =>
      `${file.filename} | ${file.name} | ${file.sampleRate} Hz | ${file.channels} canal(es) | Afinación configurada: ${file.tuning.rootKey} / ${file.tuning.scaleMode} (no aplicada al RAW)`),
    '', `Mensaje: ${delivery.message || 'Sin mensaje'}`, `Recibida: ${delivery.receivedAt || 'Pendiente'}`].join('\n');
}
