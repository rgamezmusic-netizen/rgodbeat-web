import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client, R2_BUCKET_NAME } from '@/lib/storage/r2';
import { requireDeliveryAdmin } from '@/lib/studio/deliveries/access';
import { DELIVERY_UUID, DeliveryError, deliveryReadme } from '@/lib/studio/deliveries/model';
import { deliveryFileKey, readDelivery } from '@/lib/studio/deliveries/storage';
import { deliveryFailure } from '@/lib/studio/deliveries/http';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireDeliveryAdmin();
    const { id } = await context.params;
    if (!DELIVERY_UUID.test(id)) throw new DeliveryError('Entrega no disponible.', 404);
    const stored = await readDelivery(id);
    if (!stored?.delivery.receivedAt) throw new DeliveryError('Entrega no disponible.', 404);
    const { delivery } = stored, type = request.nextUrl.searchParams.get('file');
    if (type === 'info' || type === 'metadata') {
      return new NextResponse(type === 'info' ? deliveryReadme(delivery) : JSON.stringify(delivery, null, 2), {
        headers: { 'Content-Type': type === 'info' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="RGODBEAT_${id}.${type === 'info' ? 'txt' : 'json'}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const file = delivery.files.find(file => file.id === type), client = getR2Client();
    if (!file) throw new DeliveryError('Pista no disponible.', 404);
    if (!client) throw new DeliveryError('El almacenamiento no está disponible.', 503);
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: deliveryFileKey(id, file.id),
      ResponseContentDisposition: `attachment; filename="${file.filename}"`, ResponseContentType: 'audio/wav' }), { expiresIn: 60 });
    return new NextResponse(null, { status: 303, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (error) { return deliveryFailure(error); }
}
