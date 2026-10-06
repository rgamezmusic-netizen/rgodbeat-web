import { createClient } from '@/lib/supabase/client';
import { fetchAuth } from '@/lib/auth/request';
import { CloudConnectionError } from './cloudProject';

/** Revalidate cookies once before resuming cloud operations for the same owner. */
export async function verifyStudioAccount(expectedEmail: string) {
  const read = async () => {
    const response = await fetchAuth('/api/studio/access', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok && response.status !== 401) throw new CloudConnectionError(data.error || 'No se pudo verificar la cuenta.',
      data.code || 'SERVICE_UNAVAILABLE', data.retryable ?? response.status >= 500);
    return data;
  };
  let data = await read();
  if (!data.isLoggedIn || !data.email) {
    const { error } = await createClient().auth.refreshSession();
    if (error) throw new CloudConnectionError('Vuelve a iniciar sesión. Tu proyecto local se conserva.', 'SESSION_REQUIRED', false);
    data = await read();
  }
  if (data.email?.trim().toLowerCase() !== expectedEmail) {
    throw new CloudConnectionError('Vuelve a iniciar sesión con la cuenta de este proyecto.', 'SESSION_REQUIRED', false);
  }
}

export const MAX_CLOUD_RETRIES = 3;
export function shouldRetryCloud(attempts: number, retryable: boolean, online: boolean) {
  return retryable && online && attempts < MAX_CLOUD_RETRIES;
}
