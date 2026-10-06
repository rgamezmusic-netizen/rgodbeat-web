import { formatRg } from '@/lib/rg/product/presentation';
import styles from './RgProduct.module.css';

export function RgBalance({ balanceRg, maxDiscountPercent }: { balanceRg: number; maxDiscountPercent: number }) {
  return <><p className={styles.eyebrow}>SOLO VISIBLE PARA TI</p><h1 className={styles.profileTitle}>Tu música tiene futuro.</h1><p className={styles.eyebrow}>RG BALANCE</p><p className={styles.walletValue}>{formatRg(balanceRg)} <span>RG</span></p><p className={styles.muted}>Gana RG con los premios de temporada. Las actividades y los hitos verificados te ayudan a competir por el Top 3.</p><section className={styles.section}><p className={styles.eyebrow}>MÁS ADELANTE</p><h2>De vuelta a tu música.</h2><p className={styles.muted}>RG podrá cubrir hasta el {maxDiscountPercent}% de compras elegibles dentro de RGodBeat. El uso y la compra de RG todavía no están habilitados.</p><p className={styles.footnote}>RG es una utilidad interna. No se puede retirar como dinero ni transferir fuera de RGodBeat.</p></section></>;
}
