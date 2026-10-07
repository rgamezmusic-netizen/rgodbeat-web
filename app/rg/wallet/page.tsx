import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getRgWalletSummary } from '@/lib/rg/product/wallet';
import { ProductFrame } from '@/components/ranking/RgProductParts';
import { RgBalance } from '@/components/ranking/RgBalance';
import styles from '@/components/ranking/RgProduct.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi saldo RG | RGodBeat', robots: { index: false, follow: false } };
export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/rg/wallet');
  let wallet;
  try { wallet = await getRgWalletSummary(user.id); } catch { /* Do not invent a zero balance when a service fails. */ }
  return <ProductFrame><section className={styles.section}>{wallet ? <><RgBalance balanceRg={wallet.balanceRg} maxDiscountPercent={wallet.maxDiscountPercent} /><Link className={styles.button} href="/rg/market">ABRIR RG MARKET →</Link></> : <div role="alert"><h1 className={styles.profileTitle}>Tu saldo volverá en un momento.</h1><p className={styles.muted}>No pudimos consultar tu saldo RG. Inténtalo de nuevo.</p><Link className={styles.button} href="/rg/wallet">VOLVER A INTENTAR</Link></div>}</section></ProductFrame>;
}
