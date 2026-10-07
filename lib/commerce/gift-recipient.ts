import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canCheckoutRecipientMode } from './gift-feature';

export type GiftRecipientInput = { recipientMode?: 'self' | 'gift'; recipientKind?: 'artist' | 'email'; recipientEmail?: string; recipientArtistSlug?: string };

/** Recipient resolution uses Gift V1's verified artist identity RPC. */
export async function resolveGiftRecipient(db: SupabaseClient, input: GiftRecipientInput) {
  const mode = input.recipientMode ?? 'self';
  if (!['self', 'gift'].includes(mode)) throw new Error('Destinatario no válido.');
  if (mode === 'self') return { recipient_mode: mode, recipient_kind: null, recipient_email: null, recipient_artist_id: null, recipient_artist_slug: null };
  if (!canCheckoutRecipientMode('gift') || Buffer.from(process.env.RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY || '', 'base64').length !== 32) throw new Error('Los regalos no están disponibles por el momento.');
  if (input.recipientKind === 'email') {
    const email = typeof input.recipientEmail === 'string' ? input.recipientEmail.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido.');
    return { recipient_mode: mode, recipient_kind: 'email' as const, recipient_email: email, recipient_artist_id: null, recipient_artist_slug: null };
  }
  const slug = typeof input.recipientArtistSlug === 'string' ? input.recipientArtistSlug.trim().toLowerCase() : '';
  if (input.recipientKind !== 'artist' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Selecciona un RG Artist activo.');
  const { data, error } = await db.rpc('rg_resolve_gift_artist', { p_slug: slug });
  const artist = Array.isArray(data) ? data[0] : null;
  if (error || !artist?.artist_id || !artist?.user_id || !artist?.recipient_email) throw new Error('Ese RG Artist no puede recibir el regalo.');
  return { recipient_mode: mode, recipient_kind: 'artist' as const, recipient_email: null, recipient_artist_id: artist.artist_id as string, recipient_artist_slug: slug };
}
