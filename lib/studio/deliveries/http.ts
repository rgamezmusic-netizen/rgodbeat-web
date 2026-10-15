import { NextResponse } from 'next/server';
import { DeliveryError } from './model';

export const deliveryJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
export function deliveryFailure(error: unknown) {
  if (error instanceof DeliveryError) return deliveryJson({ error: error.message }, error.status);
  console.error('[Studio delivery]', error instanceof Error ? error.name : 'Unknown error');
  return deliveryJson({ error: 'No se pudo completar la entrega. Tu proyecto local se conserva; puedes reintentar.' }, 503);
}
export async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (!request.body) throw new DeliveryError('La solicitud está vacía.');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new DeliveryError('La solicitud supera el tamaño permitido.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export async function readDeliveryJson(request: Request): Promise<unknown> {
  try { return JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 32_000))); }
  catch (error) { if (error instanceof DeliveryError) throw error; throw new DeliveryError('Datos de entrega inválidos.'); }
}
export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) throw new DeliveryError('Origen de solicitud no permitido.', 403);
}
