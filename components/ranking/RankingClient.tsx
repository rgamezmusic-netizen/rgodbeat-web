'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUp, Heart, MessageCircle, Pause, Play, Share2, ShoppingBag } from 'lucide-react';
import { usePlayer } from '@/contexts/PlayerContext';
import { useCart } from '@/contexts/CartContext';
import { LICENSE_OPTIONS } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/utils';
import type { ChartSnapshot, RankedBeat } from '@/lib/ranking/chart';
import type { Beat, LicenseTier } from '@/types';
import { SidePanel } from './SidePanel';
import { BeatConversation } from './BeatConversation';
import styles from './Ranking.module.css';

type Panel = { beat: Beat; mode: 'comments' | 'buy' };

function Artwork({ beat, className = '' }: { beat: Beat; className?: string }) {
  const [failed, setFailed] = useState(false);
  const hasCover = /^(https?:|\/)/.test(beat.cover);
  return <div className={`${styles.artwork} ${className}`}>
    {hasCover && !failed ? /* eslint-disable-next-line @next/next/no-img-element */
      <img src={beat.cover} alt={`Portada de ${beat.title}`} onError={() => setFailed(true)} /> : <div className={styles.artworkFallback}><span>RGODBEAT</span><strong>{beat.title}</strong></div>}
  </div>;
}

function Movement({ entry }: { entry: RankedBeat }) {
  if (entry.previousRank === null) return null;
  const delta = entry.previousRank - entry.rank;
  return <span className={`${styles.movement} ${delta > 0 ? styles.up : ''}`} aria-label={delta === 0 ? 'Mantiene su posición' : `${delta > 0 ? 'Sube' : 'Baja'} ${Math.abs(delta)} posiciones frente a la semana pasada`}>
    {delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : '—'}{delta === 0 ? 'IGUAL' : Math.abs(delta)}
  </span>;
}

function Purchase({ beat, onBuy }: { beat: Beat; onBuy: (beat: Beat, tier: LicenseTier) => void }) {
  const [tier, setTier] = useState<LicenseTier>('wav');
  const option = LICENSE_OPTIONS.find(item => item.id === tier) ?? LICENSE_OPTIONS[1];
  return <>
    <h3 className={styles.panelBeatTitle}>{beat.title}</h3>
    <fieldset className={styles.licenses}><legend>Licencia</legend>{LICENSE_OPTIONS.map(item => {
      const value = item.id as LicenseTier;
      return <label key={item.id} className={tier === value ? styles.selectedLicense : ''}>
        <input type="radio" name="ranking-license" value={value} checked={tier === value} onChange={() => setTier(value)} />
        <span>{item.name}{item.recommended && <small>POPULAR</small>}</span><strong>{formatCurrency(beat.pricing[value] ?? item.price)}</strong>
      </label>;
    })}</fieldset>
    <div className={styles.licenseDetails}><strong>{option.name}</strong><p>{option.format}</p><ul>{option.features.map(feature => <li key={feature}>{feature}</li>)}</ul></div>
    <button className={`${styles.goldButton} ${styles.fullButton}`} onClick={() => onBuy(beat, tier)}><ShoppingBag size={17} />Continuar al pago · {formatCurrency(beat.pricing[tier] ?? option.price)}</button>
  </>;
}

export function RankingClient({ initialChart, initialVotedIds }: { initialChart: ChartSnapshot; initialVotedIds: string[] }) {
  const [chart, setChart] = useState(initialChart);
  const [votedIds, setVotedIds] = useState(new Set(initialVotedIds));
  const [pending, setPending] = useState(new Set<string>());
  const [panel, setPanel] = useState<Panel | null>(null);
  const [notice, setNotice] = useState<{ message: string; login?: boolean } | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const player = usePlayer();
  const { addToCart } = useCart();
  const votesInFlight = useRef(new Set<string>());
  const refreshing = useRef(false);
  const refreshQueued = useRef(false);
  const alive = useRef(true);
  const chartRef = useRef(chart);
  useEffect(() => { chartRef.current = chart; }, [chart]);
  const refresh = useCallback(async function updateChart(): Promise<void> {
    if (refreshing.current) { refreshQueued.current = true; return; }
    refreshing.current = true;
    try {
      const response = await fetch('/api/beats/ranking', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.chart) throw new Error(data.error || 'No se pudo actualizar el ranking.');
      if (alive.current) { setChart(data.chart); setVotedIds(new Set(data.userVotedBeatIds)); }
    } catch (cause) {
      if (alive.current) setNotice({ message: cause instanceof Error ? cause.message : 'No se pudo actualizar el ranking.' });
    } finally {
      refreshing.current = false;
      if (refreshQueued.current && alive.current) { refreshQueued.current = false; void updateChart(); }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
    const returnToPage = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', returnToPage);
    const openSharedBeat = () => {
      const id = new URLSearchParams(window.location.search).get('beat');
      const entry = [...chartRef.current.entries, ...chartRef.current.outside].find(item => item.beat.id === id);
      if (entry) setPanel({ beat: entry.beat, mode: 'comments' });
    };
    const initial = setTimeout(openSharedBeat, 0);
    window.addEventListener('popstate', openSharedBeat);
    return () => { alive.current = false; clearTimeout(initial); clearInterval(timer); document.removeEventListener('visibilitychange', returnToPage); window.removeEventListener('popstate', openSharedBeat); };
  }, [refresh]);

  async function vote(beat: Beat) {
    if (votesInFlight.current.has(beat.id) || votedIds.has(beat.id)) return;
    votesInFlight.current.add(beat.id); setPending(new Set(votesInFlight.current));
    try {
      const response = await fetch(`/api/beats/${beat.id}/vote`, { method: 'POST' });
      const data = await response.json();
      if (!alive.current) return;
      if (response.ok || data.alreadyVoted) {
        setVotedIds(previous => new Set([...previous, beat.id]));
        setNotice({ message: data.message || `Tu voto por ${beat.title} ya cuenta.` });
        await refresh();
      } else setNotice({ message: data.error || 'No se pudo registrar el voto.', login: data.requireLogin });
    } catch { if (alive.current) setNotice({ message: 'No se pudo registrar el voto. Revisa tu conexión y vuelve a intentarlo.' }); }
    finally { votesInFlight.current.delete(beat.id); if (alive.current) setPending(new Set(votesInFlight.current)); }
  }

  function listen(beat: Beat) {
    if (player.currentBeat?.id === beat.id) player.togglePlay();
    else if (beat.previewAudioUrl) player.playBeat(beat);
  }

  async function share(beat: Beat) {
    const url = new URL('/ranking', window.location.origin); url.searchParams.set('beat', beat.id);
    try {
      if (navigator.share) await navigator.share({ title: `${beat.title} · RGODBEAT Top 23`, text: `${beat.title} · RGODBEAT`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setNotice({ message: 'Enlace copiado.' }); }
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setNotice({ message: 'No se pudo compartir. Inténtalo de nuevo.' }); }
  }

  function buy(beat: Beat, tier: LicenseTier) { setPanel(null); addToCart(beat, tier); }
  const champion = chart.entries[0];
  const isPlaying = (beat: Beat) => player.currentBeat?.id === beat.id && player.isPlaying;
  const openConversation = (beat: Beat) => setPanel({ beat, mode: 'comments' });
  const commentText = (entry: RankedBeat) => chart.commentsReady ? `${entry.comments}` : 'Comentarios';

  const voteButton = (entry: RankedBeat, prominent = false) => <button className={prominent ? styles.goldButton : styles.voteButton} onClick={() => void vote(entry.beat)} disabled={pending.has(entry.beat.id) || votedIds.has(entry.beat.id)} aria-pressed={votedIds.has(entry.beat.id)} aria-label={`${votedIds.has(entry.beat.id) ? 'Ya votaste por' : 'Votar por'} ${entry.beat.title}`}>
    <Heart size={17} fill={votedIds.has(entry.beat.id) ? 'currentColor' : 'none'} />{pending.has(entry.beat.id) ? 'Enviando…' : votedIds.has(entry.beat.id) ? 'Votado' : 'Votar'}<span>{entry.votes}</span>
  </button>;

  const row = (entry: RankedBeat, outside = false) => <article key={entry.beat.id} className={styles.chartRow}>
    <div className={styles.rowRank}>{outside ? '—' : String(entry.rank).padStart(2, '0')}</div>
    <button className={styles.rowCoverButton} onClick={() => listen(entry.beat)} disabled={!entry.beat.previewAudioUrl} aria-label={`${isPlaying(entry.beat) ? 'Pausar' : 'Escuchar'} ${entry.beat.title}`}><Artwork key={entry.beat.id} beat={entry.beat} /><span>{isPlaying(entry.beat) ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</span></button>
    <div className={styles.rowTrack}><p>{entry.beat.genre} <span>· {entry.beat.bpm} BPM</span></p><h3>{entry.beat.title}</h3>{!outside && <Movement entry={entry} />}</div>
    <div className={styles.rowCommunity}>{voteButton(entry)}<button className={styles.commentsButton} onClick={() => openConversation(entry.beat)} aria-label={`Comentarios de ${entry.beat.title}: ${commentText(entry)}`}><MessageCircle size={15} />{commentText(entry)}</button></div>
    <button className={styles.rowBuy} onClick={() => setPanel({ beat: entry.beat, mode: 'buy' })} aria-label={`Comprar ${entry.beat.title}, desde ${formatCurrency(entry.beat.price)}`}><span>DESDE</span><strong>{formatCurrency(entry.beat.price)}</strong><ArrowRight size={17} /></button>
  </article>;

  return <main className={styles.main}>
    <div className={styles.issueBar}><span>RGODBEAT</span><span>{chart.period.replace('-W', ' / SEMANA ')}</span></div>
    <header className={styles.masthead}>
      <div className={styles.headingLine}><h1>TOP <span>23</span></h1></div>
    </header>
    {champion ? <section className={styles.champion} aria-labelledby="champion-title">
      <div className={styles.championArt}><Artwork key={champion.beat.id} beat={champion.beat} /><span className={styles.coverLabel}>Nº 1 · ESTA SEMANA</span><span className={styles.championNumber} aria-hidden="true">01</span><button className={styles.coverPlay} disabled={!champion.beat.previewAudioUrl} onClick={() => listen(champion.beat)} aria-label={`${isPlaying(champion.beat) ? 'Pausar' : 'Escuchar'} ${champion.beat.title}`}>{isPlaying(champion.beat) ? <Pause fill="currentColor" size={26} /> : <Play fill="currentColor" size={26} />}</button></div>
      <div className={styles.championInfo}>
        <p className={styles.genre}>{champion.beat.genre} <span>— {champion.beat.bpm} BPM / {champion.beat.key}</span></p>
        <h2 id="champion-title">{champion.beat.title}</h2>
        <div className={styles.championActions}>{voteButton(champion, true)}<button className={styles.outlineButton} onClick={() => listen(champion.beat)} disabled={!champion.beat.previewAudioUrl}>{isPlaying(champion.beat) ? <Pause size={16} /> : <Play size={16} />} {isPlaying(champion.beat) ? 'Pausar' : 'Escuchar beat'}</button></div>
        <div className={styles.championCommunity}><button className={styles.commentsButton} onClick={() => openConversation(champion.beat)} aria-label={`Comentarios de ${champion.beat.title}: ${commentText(champion)}`}><MessageCircle size={17} />{commentText(champion)}</button><button className={styles.commentsButton} onClick={() => void share(champion.beat)}><Share2 size={16} />Compartir</button></div>
        <button className={styles.championBuy} onClick={() => setPanel({ beat: champion.beat, mode: 'buy' })}><span>COMPRAR<small>Desde {formatCurrency(champion.beat.price)}</small></span><ArrowRight size={25} /></button>
      </div>
    </section> : <section className={styles.emptyChart}><h2>Sin beats publicados</h2></section>}
    <section className={styles.positions} aria-labelledby="positions-heading"><div className={styles.sectionHeader}><h2 id="positions-heading">POSICIONES<span>/ {String(chart.entries.length).padStart(2, '0')}</span></h2></div>
      {chart.entries.slice(1).map(entry => row(entry))}
    </section>
    <div className={styles.catalogLink}><Link className={styles.outlineButton} href="/beats">Catálogo completo <ArrowRight size={17} /></Link></div>
    {chart.outside.length > 0 && <section className={styles.positions} aria-labelledby="outside-heading"><div className={styles.sectionHeader}><h2 id="outside-heading">OTROS BEATS<span>/ {chart.outside.length} BEATS</span></h2><button className={styles.commentsButton} aria-expanded={showCatalog} onClick={() => setShowCatalog(!showCatalog)}>{showCatalog ? 'Cerrar' : 'Ver más'}</button></div>{showCatalog && chart.outside.map(entry => row(entry, true))}</section>}

    {notice && createPortal(<div className={styles.notice} role="status"><p>{notice.message}{notice.login && <> <Link href="/login?redirect=%2Franking">Iniciar sesión</Link></>}</p><button aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button></div>, document.body)}
    {panel && <SidePanel key={`${panel.beat.id}-${panel.mode}`} title={panel.mode === 'comments' ? 'Comentarios / RGODBEAT' : 'Licencia / RGODBEAT'} onClose={() => setPanel(null)}>{panel.mode === 'comments' ? <BeatConversation beat={panel.beat} onChange={() => void refresh()} /> : <Purchase beat={panel.beat} onBuy={buy} />}</SidePanel>}
  </main>;
}
