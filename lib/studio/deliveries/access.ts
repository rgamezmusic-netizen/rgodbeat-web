import 'server-only';
import { getCurrentUser } from '@/lib/auth/server';
import { isSiteAdmin } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { DeliveryError } from './model';

export async function requireDeliverySender() {
  const user = await getCurrentUser();
  if (!user?.email) throw new DeliveryError('Inicia sesión para enviar tus voces a RGODBEAT.', 401);
  if (!isSiteAdmin(user)) {
    const { data, error } = await createAdminClient().from('customers').select('studio_access_until').eq('email', user.email).maybeSingle();
    if (error) throw new DeliveryError('No se pudo verificar tu Pase del Studio.', 503);
    const expiry = data?.studio_access_until ? Date.parse(data.studio_access_until) : NaN;
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new DeliveryError('Necesitas un Pase activo del Studio para enviar las voces.', 403);
  }
  return user;
}
export async function requireDeliveryAdmin() {
  const user = await getCurrentUser();
  if (!user || !isSiteAdmin(user)) throw new DeliveryError('Acceso reservado al administrador.', 403);
  return user;
}
