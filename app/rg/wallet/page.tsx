import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getRgWalletBalance, getRgWalletSummary } from '@/lib/rg/product/wallet';
import { ProductFrame } from '@/components/ranking/RgProductParts';
import { RgMyPasses } from '@/components/rg/RgMyPasses';
import { RgBalance } from '@/components/ranking/RgBalance';
import styles from '@/components/ranking/RgProduct.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi saldo RG | RGodBeat', robots: { index: false, follow: false } };
export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/rg/wallet');
  let wallet;
  let balance: number | null = null;
  try { wallet = await getRgWalletSummary(user.id); } catch {
    // The balance ledger can be available before the optional Market rollout.
    try { balance = await getRgWalletBalance(user.id); } catch { /* Keep an unavailable balance distinct from zero. */ }
  }
  return <ProductFrame><Link className={styles.textLink} href="/account">← VOLVER A MI CUENTA</Link>
    <section className={styles.section}>{wallet ? <>
      <RgBalance wallet={wallet} /><RgMyPasses wallet={wallet} />
      <div className={styles.links}><Link className={styles.button} href="/rg/market">ABRIR RG MARKET →</Link><Link className={`${styles.button} ${styles.secondary}`} href="/beats">EXPLORAR BEATS →</Link></div>
    </> : balance !== null ? <>
      <p className={styles.eyebrow}>SOLO VISIBLE PARA TI</p>
      <h1 className={styles.profileTitle}>Mi RG Wallet</h1>
      <p className={styles.eyebrow}>SALDO RG</p>
      <p className={styles.prizeValue}>{balance.toLocaleString('es-MX')} RG</p>
      <p role="status" className={styles.muted}>Tu saldo está actualizado. No pudimos consultar tus pases y beneficios en este momento.</p>
      <Link className={styles.button} href="/rg/wallet">VOLVER A CONSULTAR</Link>
    </> : <div role="alert"><h1 className={styles.profileTitle}>Tu saldo volverá en un momento.</h1><p className={styles.muted}>No pudimos consultar tu saldo RG. Inténtalo de nuevo.</p><Link className={styles.button} href="/rg/wallet">VOLVER A INTENTAR</Link></div>}</section>
  </ProductFrame>;
}
