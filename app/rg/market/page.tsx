import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/server';
import { getRgWalletSummary } from '@/lib/rg/product/wallet';
import { RgMarketClient } from '@/components/rg/RgMarketClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'RG Market | RGodBeat', robots: { index: false, follow: false } };

export default async function RgMarketPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/rg/market');
  let wallet: Awaited<ReturnType<typeof getRgWalletSummary>> | null = null;
  try {
    wallet = await getRgWalletSummary(user.id);
  } catch { /* Show a service error rather than inventing a zero balance. */ }
  if (!wallet) return <main className="mx-auto max-w-3xl px-4 py-12 text-white"><h1 className="text-2xl font-bold">RG Market no está disponible.</h1><p className="mt-2 text-sm text-zinc-400">Inténtalo de nuevo más tarde.</p><Link href="/rg/wallet" className="mt-5 inline-block text-sm text-amber-300">Volver a RG Wallet</Link></main>;
  return <div className="min-h-screen bg-[#08080b]"><nav className="mx-auto max-w-5xl px-4 pt-6 sm:px-6"><Link className="text-xs font-mono text-zinc-400 hover:text-white" href="/rg/wallet">← VOLVER A RG WALLET</Link></nav><RgMarketClient initialWallet={wallet} /></div>;
}
