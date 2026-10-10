import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { RgSeasonRankingClient } from '@/components/ranking/RgSeasonRankingClient';
import { RgMemberCard } from '@/components/ranking/RgMemberCard';
import { getRgChart } from '@/lib/rg/product/chart';
import styles from '@/components/ranking/RgProduct.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'RG TOP 23 — El chart de RGodBeat', description: 'Tracks, artistas y beats. Compite cada 14 días por Premium y los premios RG de temporada.' };

export default async function RgSeasonRankingPage() {
  let data;
  try { data = await getRgChart(); }
  catch { /* A service outage must not look like an empty competition. */ }
  return <div className={styles.page} style={{ background: "transparent" }}><Navbar /><main className={styles.main}>{data ? <><RgSeasonRankingClient data={data} /><Suspense fallback={<section className={styles.member} role="status"><p className={styles.muted}>Cargando tu perfil…</p></section>}><RgMemberCard /></Suspense></> : <section className={styles.empty} role="alert"><p className={styles.eyebrow}>RG TOP 23</p><h1>El chart volverá en un momento.</h1><p>No pudimos cargar la temporada. Inténtalo de nuevo.</p><Link className={styles.button} href="/ranking/season">VOLVER A INTENTAR</Link></section>}</main><Footer /></div>;
}
