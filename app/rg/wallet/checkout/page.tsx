import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';
import { RgPassResume } from '@/components/rg/RgPassResume';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Continuar operación RG | RGodBeat', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/rg/wallet');
  const { intent } = await searchParams;
  if (!intent || !/^[0-9a-f-]{36}$/i.test(intent)) notFound();
  const { data, error } = await createCommerceAdminClient().from('commerce_checkout_intents').select('id,recipient_mode,snapshot')
    .eq('id', intent).eq('buyer_auth_user_id', user.id).maybeSingle();
  if (error || !data || data.snapshot?.paymentMethod !== 'rg_market') notFound();
  return <RgPassResume intentId={data.id} gift={data.recipient_mode === 'gift'} />;
}
