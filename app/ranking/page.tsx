import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { AtmosphericBackground } from '@/components/atmosphere';
import { RankingClient } from '@/components/ranking/RankingClient';
import { getPublicChart } from '@/lib/ranking/server';
import { getCurrentUser } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '@/components/ranking/Ranking.module.css';
import type { ChartSnapshot } from '@/lib/ranking/chart';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Top 23 | RGODBEAT — La elección de la comunidad',
  description: 'Escucha, vota y comenta los beats de RGODBEAT. Descubre el Top 23 semanal y encuentra la licencia para tu próximo lanzamiento.',
};

export default async function RankingPage() {
  let chart: ChartSnapshot | null = null;
  let votedIds: string[] = [];
  try {
    const [snapshot, user] = await Promise.all([getPublicChart(), getCurrentUser()]);
    chart = snapshot;
    if (user) {
      const { data, error } = await createAdminClient().from('beat_votes').select('beat_id').eq('user_id', user.id).eq('week_period', chart.period);
      if (error) throw new Error('No se pudieron consultar los votos.');
      votedIds = (data ?? []).map(row => row.beat_id);
    }
  } catch (error) {
    console.error('[Ranking page]', error);
    chart = null;
  }
  const content = chart ? <RankingClient initialChart={chart} initialVotedIds={votedIds} /> :
    <main className={styles.main}><section className={styles.emptyChart}><p className={styles.eyebrow}>RGODBEAT / TOP 23</p><h1>Volvemos en un momento.</h1><p>No pudimos cargar el ranking. Vuelve a intentarlo o explora el catálogo.</p><div className={styles.championActions}><Link className={styles.goldButton} href="/ranking">Volver a intentar</Link><Link className={styles.outlineButton} href="/beats">Ver catálogo</Link></div></section></main>;
  return <div className={styles.page}><AtmosphericBackground theme="default" intensity="high" enableStars={true} starDensity="high" animate={true} /><Navbar />{content}<Footer /></div>;
}
