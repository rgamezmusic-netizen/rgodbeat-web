'use client';

import { useEffect, useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ChartData } from '@/lib/rg/product/types';
import { emptyRanking, formatRg, seasonCountdown } from '@/lib/rg/product/presentation';
import { ArtistRewards, ChartRow, HowToCompete, Sponsors } from './RgProductParts';
import styles from './RgProduct.module.css';

export function RgSeasonRankingClient({ data }: { data: ChartData }) {
  const [kind, setKind] = useState<'tracks' | 'artists' | 'beats'>('tracks');
  const [clock, setClock] = useState({ serverTime: data.serverTime, elapsed: 0 });
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => setClock({ serverTime: data.serverTime, elapsed: performance.now() - started }), 30_000);
    return () => clearInterval(timer);
  }, [data.serverTime]);
  const elapsed = clock.serverTime === data.serverTime ? clock.elapsed : 0;
  const entries = data.rankings[kind];
  const empty = emptyRanking[kind];
  const kinds = ['tracks', 'artists', 'beats'] as const;
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    const index = kinds.indexOf(kind);
    const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
    if (next === null) return;
    event.preventDefault();
    setKind(kinds[next]);
    document.getElementById(`tab-${kinds[next]}`)?.focus();
  }
  return <>
    <header className={styles.hero}><div className={styles.seasonLine}><span>SEASON {String(data.season.season_number).padStart(2, '0')}</span><span className={styles.countdown}>{seasonCountdown(data.season.ends_at, data.serverTime, elapsed)}</span></div><h1>RG TOP 23<span style={{ color: '#e4be63' }}>.</span></h1><p>La música mueve el ranking. Cada 14 días, una nueva oportunidad.</p></header>
    <section className={styles.prize} aria-label="Premio de temporada"><div><p className={styles.eyebrow}>REWARD POOL</p><div className={styles.prizeValue}>{data.rewardPoolRg > 0 ? <>{formatRg(data.rewardPoolRg)} <span className={styles.eyebrow}>RG</span></> : 'En construcción'}</div></div><p className={styles.muted}>El premio de la temporada puede crecer con actividad y apoyo de la comunidad y los sponsors.</p></section>
    <ArtistRewards rewards={data.rewards} />
    <div className={styles.tabs}><div role="tablist" aria-label="Clasificaciones RG" className={styles.tabButtons}>{kinds.map(tab => <button type="button" className={styles.tab} key={tab} id={`tab-${tab}`} role="tab" tabIndex={kind === tab ? 0 : -1} aria-selected={kind === tab} aria-controls="rg-chart" onClick={() => setKind(tab)} onKeyDown={navigateTabs}>{tab.toUpperCase()}</button>)}</div><button type="button" className={styles.refresh} disabled={pending} onClick={() => startTransition(() => router.refresh())} aria-label="Actualizar clasificación">{pending ? 'Actualizando…' : 'Actualizar'}</button></div>
    <section id="rg-chart" role="tabpanel" aria-labelledby={`tab-${kind}`} className={styles.list}>{entries.length ? entries.map(entry => <ChartRow key={entry.entityId} entry={entry} kind={kind} />) : <div className={styles.empty}><span className={styles.eyebrow}>SEASON {String(data.season.season_number).padStart(2, '0')} · {kind.toUpperCase()}</span><h2>{empty.title}</h2><p>{empty.detail}</p><Link className={styles.button} href={empty.href}>{empty.cta}</Link></div>}</section>
    <p className={styles.footnote}>Actividad verificada, posiciones automáticas. El dinero nunca compra rango.</p>
    <Sponsors sponsors={data.sponsors} /><HowToCompete />
  </>;
}
