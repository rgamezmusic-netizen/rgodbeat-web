import { Navbar } from '@/components/layout/Navbar';
import styles from '@/components/ranking/RgProduct.module.css';

export default function Loading() {
  return <div className={styles.page} style={{ background: "transparent" }}>
    <Navbar />
    <main className={styles.main} aria-busy="true">
      <header className={styles.hero}><h1>RG TOP 23<span style={{ color: '#e4be63' }}>.</span></h1><p role="status">Cargando temporada y clasificaciones…</p></header>
      <div className="mt-8 space-y-3" aria-hidden="true">
        {[0, 1, 2].map(row => <div key={row} className="h-24 rounded-xl bg-white/5" />)}
      </div>
    </main>
  </div>;
}
