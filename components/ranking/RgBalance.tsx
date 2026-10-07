import { RgWalletStatus } from '@/components/rg/RgWalletStatus';
import type { RgWalletSummary } from '@/lib/rg/product/wallet-client';
import styles from './RgProduct.module.css';

export function RgBalance({ wallet }: { wallet: RgWalletSummary }) {
  return <>
    <p className={styles.eyebrow}>SOLO VISIBLE PARA TI</p>
    <h1 className={styles.profileTitle}>Mi RG Wallet</h1>
    <RgWalletStatus wallet={wallet} />
    <p className={styles.muted}>Gana RG con los premios de temporada. Las actividades y los hitos verificados te ayudan a competir por el Top 3.</p>
    <section className={styles.section}>
      <h2>Tus pases y tu saldo</h2>
      <p className={styles.muted}>Los RG canjeados por un Beat Pass se descuentan de tu saldo. El pase queda disponible hasta que lo uses para una licencia elegible.</p>
      <p className={styles.muted}>{wallet.beatPassEnabled ? 'Puedes obtener RG Beat Pass en RG Market y usar tus pases desde el carrito de una compra elegible.' : 'El canje RG Beat Pass no está habilitado en este momento.'}</p>
      <p className={styles.footnote}>RG es una utilidad interna. No se puede retirar como dinero ni transferir fuera de RGodBeat.</p>
    </section>
  </>;
}
