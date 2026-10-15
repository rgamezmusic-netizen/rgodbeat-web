import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { deliveryJson, deliveryFailure } from '@/lib/studio/deliveries/http';
import { listDeliveries } from '@/lib/studio/deliveries/storage';
import { deliveryEmailConfigured, notifyDelivery } from '@/lib/studio/deliveries/notification';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET, actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return deliveryJson({ error: 'Unauthorized.' }, 401);
  if (!deliveryEmailConfigured()) return deliveryJson({ error: 'El correo de entregas no está configurado.' }, 503);
  try {
    let cursor: string | undefined, processed = 0, sent = 0;
    const deadline = Date.now() + 75_000;
    do {
      const page = await listDeliveries(cursor);
      for (const delivery of page.deliveries) {
        if (delivery.notification === 'sent') continue;
        if (processed >= 10 || Date.now() >= deadline) return deliveryJson({ sent, pending: processed - sent });
        processed++;
        if (await notifyDelivery(delivery.id) === 'sent') sent++;
      }
      cursor = page.cursor;
    } while (cursor && Date.now() < deadline);
    return deliveryJson({ sent, pending: processed - sent });
  } catch (error) { return deliveryFailure(error); }
}
