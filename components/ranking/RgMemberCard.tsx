import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/server';
import { getOwnedArtist } from '@/lib/rg/identity';
import { getRgWalletSummary } from '@/lib/rg/product/wallet';
import { formatRg } from '@/lib/rg/product/presentation';
import styles from './RgProduct.module.css';

export async function RgMemberCard() {
  const user = await getCurrentUser();
  if (!user) return <section className={styles.member}><div><p className={styles.eyebrow}>TU PRÓXIMA TEMPORADA EMPIEZA AQUÍ</p><strong>Entra con tu música.</strong></div><Link className={styles.button} href="/login?redirect=/ranking/season">INICIAR SESIÓN</Link></section>;
  let summary;
  try { summary = await Promise.all([getOwnedArtist(user.id), getRgWalletSummary(user.id)]); }
  catch { /* A failed balance read must not imply zero. */ }
  if (!summary) return <section className={styles.member}><p className={styles.muted}>Tu saldo no está disponible en este momento.</p><Link className={styles.textLink} href="/rg/wallet">Consultar saldo</Link></section>;
  const [artist, wallet] = summary;
  return <section className={styles.member} aria-label="Tu perfil y saldo privados"><div><p className={styles.eyebrow}>TU RG BALANCE</p><strong>{formatRg(wallet.balanceRg)} RG</strong></div><div className={styles.links}>{artist?.status === 'active' && <Link className={styles.textLink} href={`/rg/artists/${artist.slug}`}>{artist.stage_name}</Link>}<Link className={`${styles.button} ${styles.secondary}`} href="/rg/wallet">MI SALDO</Link><Link className={styles.button} href="/studio">ABRIR STUDIO</Link></div></section>;
}
