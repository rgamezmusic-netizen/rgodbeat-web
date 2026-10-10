'use client';

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ChartData } from '@/lib/rg/product/types';
import { emptyRanking, formatRg, seasonCountdown } from '@/lib/rg/product/presentation';
import { ArtistRewards, ChartRow, HowToCompete, Sponsors } from './RgProductParts';
import styles from './RgProduct.module.css';
import { useBrowsePreferences } from '@/lib/browser/browse-preferences';
import { navigationServerTime } from '@/lib/browser/navigation-clock';

export function RgSeasonRankingClient({ data }: { data: ChartData }) {
  const [{ rankingKind: kind }, updateBrowse] = useBrowsePreferences();
  const setKind = (rankingKind: 'tracks' | 'artists' | 'beats') => updateBrowse({ rankingKind });
  const [clock, setClock] = useState(() => ({ serverTime: data.serverTime,
    elapsed: Math.max(0, (navigationServerTime() ?? Date.parse(data.serverTime)) - Date.parse(data.serverTime)) }));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const refreshedSeasonRef = useRef<string | null>(null);
  useEffect(() => {
    const started = performance.now();
    const update = () => {
      const elapsed = Math.max(0, (navigationServerTime() ?? (Date.parse(data.serverTime) + performance.now() - started)) - Date.parse(data.serverTime));
      setClock({ serverTime: data.serverTime, elapsed });
      // Advance an open chart at the real season boundary, once per season.
      // Use server time so a phone with the wrong clock cannot end it early.
      if (!document.hidden && Date.parse(data.serverTime) + elapsed >= Date.parse(data.season.ends_at)
        && refreshedSeasonRef.current !== data.season.id) {
        refreshedSeasonRef.current = data.season.id;
        startTransition(() => router.refresh());
      }
    };
    // A warm page can already belong to an ended season when opened.
    queueMicrotask(update);
    const timer = setInterval(update, 30_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [data.serverTime, data.season.id, data.season.ends_at, router, startTransition]);
  const elapsed = clock.serverTime === data.serverTime ? clock.elapsed : 0;
  const seasonTime = Date.parse(data.serverTime) + elapsed;
  const seasonInProgress = data.season.status === 'active'
    && seasonTime >= Date.parse(data.season.starts_at) && seasonTime < Date.parse(data.season.ends_at);
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
    <header className={styles.hero}><div className={styles.seasonLine}><span>SEASON {String(data.season.season_number).padStart(2, '0')}{seasonInProgress && <span className={styles.liveSeason}>EN CURSO</span>}</span><span className={styles.countdown}>{seasonCountdown(data.season.ends_at, data.serverTime, elapsed)}</span></div><h1>RG TOP 23<span style={{ color: '#e4be63' }}>.</span></h1><p>La música mueve el ranking. Cada 14 días, una nueva oportunidad.</p></header>
    <section className={styles.prize} aria-label="Premio de temporada"><div><p className={styles.eyebrow}>REWARD POOL</p><div className={styles.prizeValue}>{formatRg(data.rewardPoolRg)} <span className={styles.eyebrow}>RG</span></div></div><p className={styles.muted}>Premio acumulado de esta temporada.</p></section>
    <ArtistRewards rewards={data.rewards} tail={data.rewardTail} />
    <div className={styles.tabs}><div role="tablist" aria-label="Clasificaciones RG" className={styles.tabButtons}>{kinds.map(tab => <button type="button" className={styles.tab} key={tab} id={`tab-${tab}`} role="tab" tabIndex={kind === tab ? 0 : -1} aria-selected={kind === tab} aria-controls="rg-chart" onClick={() => setKind(tab)} onKeyDown={navigateTabs}>{tab.toUpperCase()}</button>)}</div><button type="button" className={styles.refresh} disabled={pending} onClick={() => startTransition(() => router.refresh())} aria-label="Actualizar clasificación">{pending ? 'Actualizando…' : 'Actualizar'}</button></div>
    <section id="rg-chart" role="tabpanel" aria-labelledby={`tab-${kind}`} className={styles.list}>{entries.length ? entries.map(entry => <ChartRow key={entry.entityId} entry={entry} kind={kind} />) : <div className={styles.empty}><span className={styles.eyebrow}>SEASON {String(data.season.season_number).padStart(2, '0')} · {kind.toUpperCase()}</span><h2>{empty.title}</h2><p>{empty.detail}</p><Link className={styles.button} href={empty.href}>{empty.cta}</Link></div>}</section>
    <Sponsors sponsors={data.sponsors} /><HowToCompete />
  </>;
}
