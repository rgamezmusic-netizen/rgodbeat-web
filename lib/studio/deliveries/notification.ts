import 'server-only';
import { readDelivery, writeDelivery } from './storage';
import { deliveryReadme } from './model';

export const deliveryRecipient = () => process.env.RG_STUDIO_DELIVERY_EMAIL?.trim() || 'rgodbeat@gmail.com';
export function deliveryEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryRecipient()));
}
export async function notifyDelivery(id: string): Promise<'sent' | 'pending'> {
  const current = await readDelivery(id);
  if (!current?.delivery.receivedAt) return 'pending';
  if (current.delivery.notification === 'sent') return 'sent';
  if (!deliveryEmailConfigured() || Date.parse(current.delivery.notificationLeaseUntil || '') > Date.now()) return 'pending';
  const leased = { ...current.delivery, notificationLeaseUntil: new Date(Date.now() + 120_000).toISOString() };
  try { await writeDelivery(leased, current.etag); } catch { return 'pending'; }
  try {
    const base = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://rgodbeat.com');
    if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid site origin');
    const link = new URL(`/admin/studio-deliveries?delivery=${id}`, base.origin).href;
    const text = `${deliveryReadme(leased)}\n\nAbrir entrega privada (requiere cuenta administradora):\n${link}`;
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
    const response = await fetch('https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `studio-delivery-${id}` },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [deliveryRecipient()],
        subject: `Voces recibidas: ${leased.artistName} — ${leased.title}`.replace(/[\r\n]/g, ' '),
        text, html: `<pre style="white-space:pre-wrap">${escape(text)}</pre>` }),
      signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    const result = await response.json() as { id?: string };
    if (!response.ok) throw new Error(`resend_http_${response.status}`);
    if (!result.id) throw new Error('resend_missing_confirmation');
    const latest = await readDelivery(id);
    if (!latest) throw new Error('Delivery missing');
    await writeDelivery({ ...latest.delivery, notification: 'sent', notifiedAt: new Date().toISOString(), notificationLeaseUntil: null,
      notificationMessageId: result.id, notificationError: null }, latest.etag);
    return 'sent';
  } catch (error) {
    // Receipt is durable before any mail request. Keep a retryable state without losing audio.
    const latest = await readDelivery(id).catch(() => null);
    if (latest && latest.delivery.notification !== 'sent') {
      const code = error instanceof Error && /^resend_(http_\d{3}|missing_confirmation)$/.test(error.message)
        ? error.message : 'notification_temporary_failure';
      await writeDelivery({ ...latest.delivery, notificationLeaseUntil: null, notificationError: code }, latest.etag).catch(() => {});
    }
    return 'pending';
  }
}
