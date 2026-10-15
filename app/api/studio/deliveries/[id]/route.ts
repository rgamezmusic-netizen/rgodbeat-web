import { NextRequest } from 'next/server';
import { requireDeliverySender } from '@/lib/studio/deliveries/access';
import { DELIVERY_CHUNK_BYTES, DELIVERY_UUID, DeliveryError } from '@/lib/studio/deliveries/model';
import { deliveryJson, deliveryFailure, readLimitedBody, requireSameOrigin } from '@/lib/studio/deliveries/http';
import { deliveryFileReady, finishDeliveryFile, indexDelivery, readDelivery, stageDeliveryChunk, writeDelivery } from '@/lib/studio/deliveries/storage';
import { notifyDelivery } from '@/lib/studio/deliveries/notification';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };
async function owned(context: Context) {
  const user = await requireDeliverySender(), { id } = await context.params;
  if (!DELIVERY_UUID.test(id)) throw new DeliveryError('Entrega no disponible.', 404);
  const stored = await readDelivery(id);
  if (!stored || stored.delivery.ownerId !== user.id) throw new DeliveryError('Entrega no disponible.', 404);
  return stored;
}
export async function PUT(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const { delivery } = await owned(context);
    if (delivery.receivedAt) throw new DeliveryError('Esta entrega ya está recibida. Sus archivos no se pueden reemplazar.', 409);
    if (Date.now() - Date.parse(delivery.createdAt) > 24 * 60 * 60 * 1000) throw new DeliveryError('La subida venció. Inicia una nueva entrega.', 410);
    const file = delivery.files.find(file => file.id === request.nextUrl.searchParams.get('file'));
    if (!file) throw new DeliveryError('Pista no disponible.', 404);
    const indexValue = request.nextUrl.searchParams.get('index');
    if (indexValue === null || !/^\d+$/.test(indexValue)) throw new DeliveryError('Fragmento inválido.');
    await stageDeliveryChunk(delivery.id, file, Number(indexValue), Buffer.from(await readLimitedBody(request, DELIVERY_CHUNK_BYTES)));
    return deliveryJson({ success: true });
  } catch (error) { return deliveryFailure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const stored = await owned(context), { delivery } = stored;
    const fileId = request.nextUrl.searchParams.get('file');
    if (fileId) {
      const file = delivery.files.find(file => file.id === fileId);
      if (!file) throw new DeliveryError('Pista no disponible.', 404);
      if (!delivery.receivedAt) await finishDeliveryFile(delivery.id, file);
      return deliveryJson({ success: true });
    }
    if (!delivery.receivedAt) {
      for (const file of delivery.files) {
        if (!await deliveryFileReady(delivery.id, file)) throw new DeliveryError('Todavía faltan pistas por subir. Reintenta el envío.', 409);
      }
      delivery.receivedAt = new Date().toISOString();
      await writeDelivery(delivery, stored.etag);
    }
    // Retrying final confirmation repairs a missing index without creating another receipt.
    await indexDelivery(delivery);
    const notification = await notifyDelivery(delivery.id).catch(() => 'pending' as const);
    return deliveryJson({ success: true, id: delivery.id, receivedAt: delivery.receivedAt, notification });
  } catch (error) { return deliveryFailure(error); }
}
