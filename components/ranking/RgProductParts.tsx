import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Navbar, Footer } from '@/components/layout';
import { formatRg, movementLabel, RG_CHART_PATH } from '@/lib/rg/product/presentation';
import type { ChartData, ChartEntry, SeasonPerformance } from '@/lib/rg/product/types';
import styles from './RgProduct.module.css';

export function Movement({ movement, isNew }: { movement: number | null; isNew: boolean }) {
  const label = movementLabel(movement, isNew);
  return <span className={`${styles.movement} ${isNew ? styles.new : movement && movement > 0 ? styles.up : movement && movement < 0 ? styles.down : ''}`} aria-label={`Movimiento: ${label}`}>{label}</span>;
}
export function ChartRow({ entry, kind }: { entry: ChartEntry; kind: 'tracks' | 'artists' | 'beats' }) {
  const title = kind === 'tracks' ? entry.track?.title : kind === 'artists' ? entry.artist?.stage_name : entry.beat?.title;
  const href = kind === 'tracks' ? `/rg/tracks/${entry.entityId}` : kind === 'artists' ? `/rg/artists/${entry.artist?.slug}` : `/rg/beats/${encodeURIComponent(entry.beat?.slug ?? '')}`;
  const detail = kind === 'tracks' ? entry.artist?.stage_name : kind === 'artists' ? 'RG ARTIST' : `RGodBeat · ${entry.rankedTrackCount ?? 0} tracks en Top 23`;
  if (!title) return null;
  return <Link href={href} className={`${styles.row} ${entry.rank <= 3 ? styles.top : ''} ${entry.rank === 1 ? styles.champion : ''}`}>
    <span className={styles.rank}>#{String(entry.rank).padStart(2, '0')}</span>
    <div className={styles.identity}><strong>{title}</strong><p>{entry.rank === 1 ? 'LIDERA LA TEMPORADA · ' : ''}{detail}</p></div>
    <div className={styles.points}>{formatRg(entry.score)} <small>pts</small><Movement movement={entry.movement} isNew={entry.isNew} /></div>
  </Link>;
}
export function ArtistRewards({ rewards }: { rewards: ChartData['rewards'] }) {
  return <section aria-label="Premios del Top 3 de artistas"><p className={styles.eyebrow}>TOP 3 ARTISTS · PREMIOS DE TEMPORADA</p><div className={styles.rewardGrid}>
    {rewards.map(reward => <article key={reward.place} className={styles.reward}><span className={styles.eyebrow}>#{reward.place}</span><strong>{reward.premiumDays} DÍAS PREMIUM</strong><small>+ {reward.poolSharePercent}% DEL REWARD POOL</small></article>)}
  </div></section>;
}
export function Sponsors({ sponsors }: { sponsors: ChartData['sponsors'] }) {
  if (!sponsors.length) return null;
  return <section className={styles.section}><p className={styles.eyebrow}>PRESENTADO POR</p><div className={styles.sponsors}>{sponsors.map((sponsor, index) => {
    const content = <>{sponsor.logoUrl && <Image src={sponsor.logoUrl} alt="" width={56} height={40} unoptimized />}<div><strong>{sponsor.name}</strong><small>{sponsor.tier.replaceAll('_', ' ')}</small></div></>;
    return sponsor.websiteUrl ? <a className={styles.sponsor} key={`${sponsor.name}-${index}`} href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer">{content}</a> : <div className={styles.sponsor} key={`${sponsor.name}-${index}`}>{content}</div>;
  })}</div></section>;
}
export function HowToCompete() {
  return <section className={styles.section}><p className={styles.eyebrow}>TU MÚSICA. TU TEMPORADA.</p><h2>Haz que tu música suba.</h2><div className={styles.learnGrid}>
    <div><span className={styles.eyebrow}>01 / PUBLICA</span><h3>Empieza en Studio.</h3><p>Crea tu perfil de artista y publica tu track con RGodBeat. Una publicación verificada te abre el camino al chart.</p></div>
    <div><span className={styles.eyebrow}>02 / CRECE</span><h3>Llega más lejos.</h3><p>El rendimiento verificado de tus publicaciones y sus hitos ayudan a mover el ranking. Cada temporada dura 14 días.</p></div>
    <div><span className={styles.eyebrow}>03 / GANA</span><h3>Compite por el Top 3.</h3><p>Los tres primeros artistas ganan Premium y una parte del premio RG disponible. Una nueva temporada trae una nueva oportunidad.</p></div>
  </div><div className={styles.links}><Link className={styles.button} href="/studio">PUBLICAR EN RGODBEAT STUDIO</Link></div><p className={styles.footnote}>El apoyo de la comunidad y los sponsors puede hacer crecer el premio. Nunca compra puntos ni posiciones. Las compras, aportaciones y el uso de RG todavía no están habilitados.</p></section>;
}
export function Performance({ data, seasonNumber }: { data: SeasonPerformance; seasonNumber: number }) {
  return <section aria-label="Rendimiento de temporada" className={styles.performance}><div><small>SEASON {String(seasonNumber).padStart(2, '0')}</small><strong>{data.rank ? `#${String(data.rank).padStart(2, '0')}` : 'Sin posición'}</strong><Movement movement={data.movement} isNew={data.isNew} /></div><div><small>SEASON SCORE</small><strong>{formatRg(data.score)} <small>pts</small></strong></div></section>;
}
export function ProductFrame({ children }: { children: ReactNode }) {
  return <div className={styles.page}><Navbar /><main className={styles.main}><Link className={styles.textLink} href={RG_CHART_PATH}>← RG TOP 23</Link>{children}</main><Footer /></div>;
}

export function ProfileUnavailable({ href }: { href: string }) {
  return <ProductFrame><section className={`${styles.section} ${styles.empty}`} role="alert"><p className={styles.eyebrow}>RG TOP 23</p><h1>El perfil volverá en un momento.</h1><p>No pudimos cargar sus datos. Inténtalo de nuevo.</p><Link className={styles.button} href={href}>VOLVER A INTENTAR</Link></section></ProductFrame>;
}
