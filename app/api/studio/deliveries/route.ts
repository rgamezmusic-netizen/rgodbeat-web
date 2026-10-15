import { NextRequest } from 'next/server';
import { isR2Configured } from '@/lib/storage/r2';
import { requireDeliverySender } from '@/lib/studio/deliveries/access';
import { deliveryEmailConfigured } from '@/lib/studio/deliveries/notification';
import { DELIVERY_UUID, DeliveryError, parseDeliveryInput } from '@/lib/studio/deliveries/model';
import { deliveryJson, deliveryFailure, readDeliveryJson, requireSameOrigin } from '@/lib/studio/deliveries/http';
import { readDelivery, reserveDeliveryQuota, writeDelivery } from '@/lib/studio/deliveries/storage';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await requireDeliverySender();
    return deliveryJson({ available: isR2Configured(), emailNotifications: deliveryEmailConfigured(), contactEmail: user.email });
  } catch (error) { return deliveryFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const user = await requireDeliverySender();
    if (!isR2Configured()) throw new DeliveryError('El almacenamiento de entregas no está configurado.', 503);
    const body = await readDeliveryJson(request) as { id?: string };
    if (!body || !DELIVERY_UUID.test(body.id || '')) throw new DeliveryError('Identificador de entrega inválido.');
    const input = parseDeliveryInput(body), id = body.id!;
    const existing = await readDelivery(id);
    if (existing) {
      if (existing.delivery.ownerId !== user.id) throw new DeliveryError('Entrega no disponible.', 404);
      if (JSON.stringify(parseDeliveryInput(existing.delivery)) !== JSON.stringify(input)) throw new DeliveryError('Los datos cambiaron. Inicia una nueva entrega.', 409);
      return deliveryJson({ id, received: Boolean(existing.delivery.receivedAt), notification: existing.delivery.notification });
    }
    await reserveDeliveryQuota(user.id);
    await writeDelivery({ ...input, id, ownerId: user.id, contactEmail: user.email!.trim().toLowerCase(),
      createdAt: new Date().toISOString(), receivedAt: null, notification: 'pending', notifiedAt: null }, null);
    return deliveryJson({ id, received: false, notification: 'pending' }, 201);
  } catch (error) { return deliveryFailure(error); }
}
