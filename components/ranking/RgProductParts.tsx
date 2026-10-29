import Link from 'next/link';
import { RetryRouteButton } from '@/components/ui/RetryRouteButton';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Navbar, Footer } from '@/components/layout';
import { formatRg, movementLabel, RG_CHART_PATH } from '@/lib/rg/product/presentation';
import type { ChartData, ChartEntry, RgInteractionStats, SeasonPerformance } from '@/lib/rg/product/types';
import styles from './RgProduct.module.css';

function normalizeInteractions(stats?: Partial<RgInteractionStats> | null, defaultRecorded = 1): RgInteractionStats {
  return {
    recordedCount: stats?.recordedCount != null ? Math.max(0, Number(stats.recordedCount) || 0) : defaultRecorded,
    viewCount: stats?.viewCount != null ? Math.max(0, Number(stats.viewCount) || 0) : 0,
    likeCount: stats?.likeCount != null ? Math.max(0, Number(stats.likeCount) || 0) : 0,
    commentCount: stats?.commentCount != null ? Math.max(0, Number(stats.commentCount) || 0) : 0,
  };
}

export function InteractionStrip({
  stats,
  kind,
}: {
  stats?: Partial<RgInteractionStats> | null;
  kind: 'tracks' | 'artists' | 'beats';
}) {
  const s = normalizeInteractions(stats, 1);
  const recLabel =
    kind === 'tracks'
      ? 'GRABADO'
      : `${formatRg(s.recordedCount)} ${s.recordedCount === 1 ? 'GRABADO' : 'GRABADOS'}`;
  return (
    <div className={styles.interactionStrip} aria-label="Interacciones de Studio y YouTube">
      <span className={styles.recBadge}>
        <span className={styles.recDot} />
        {recLabel}
      </span>
      <span className={styles.statPill} title="Vistas en YouTube">
        <span>▶</span> {formatRg(s.viewCount)} <small>VIEWS</small>
      </span>
      <span className={styles.statPill} title="Likes en YouTube">
        <span>♥</span> {formatRg(s.likeCount)} <small>LIKES</small>
      </span>
      <span className={styles.statPill} title="Comentarios en YouTube">
        <span>💬</span> {formatRg(s.commentCount)} <small>COMMENTS</small>
      </span>
    </div>
  );
}

export function InteractionPanel({
  stats,
  mode,
}: {
  stats?: Partial<RgInteractionStats> | null;
  mode: 'artist' | 'track' | 'beat';
}) {
  const s = normalizeInteractions(stats, mode === 'track' ? 1 : 0);
  const recValue =
    mode === 'track'
      ? 'GRABADO'
      : `${formatRg(s.recordedCount)} ${s.recordedCount === 1 ? 'GRABADO' : 'GRABADOS'}`;
  return (
    <section className={styles.interactionPanel} aria-label="Conteo de interacciones en Studio y YouTube">
      <div className={styles.interactionHeader}>
        <span className={styles.recBadge}>
          <span className={styles.recDot} />
          SELLO STUDIO · YOUTUBE
        </span>
        <span className={styles.interactionSub}>CONTEO DE INTERACCIONES CONECTADO</span>
      </div>
      <div className={styles.interactionGrid}>
        <div className={`${styles.interactionCard} ${styles.interactionCardRec}`}>
          <small>{mode === 'track' ? 'ESTADO EN STUDIO' : 'TRACKS EN STUDIO'}</small>
          <strong>{recValue}</strong>
        </div>
        <div className={styles.interactionCard}>
          <small>▶ VIEWS</small>
          <strong>{formatRg(s.viewCount)}</strong>
        </div>
        <div className={styles.interactionCard}>
          <small>♥ LIKES</small>
          <strong>{formatRg(s.likeCount)}</strong>
        </div>
        <div className={styles.interactionCard}>
          <small>💬 COMMENTS</small>
          <strong>{formatRg(s.commentCount)}</strong>
        </div>
      </div>
    </section>
  );
}

export function Movement({ movement, isNew }: { movement: number | null; isNew: boolean }) {
  const label = movementLabel(movement, isNew);
  return <span className={`${styles.movement} ${isNew ? styles.new : movement && movement > 0 ? styles.up : movement && movement < 0 ? styles.down : ''}`} aria-label={`Movimiento: ${label}`}>{label}</span>;
}
export function ChartRow({ entry, kind }: { entry: ChartEntry; kind: 'tracks' | 'artists' | 'beats' }) {
  const title = kind === 'tracks' ? entry.track?.title : kind === 'artists' ? entry.artist?.stage_name : entry.beat?.title;
  const href = kind === 'tracks' ? `/rg/tracks/${entry.entityId}` : kind === 'artists' ? `/rg/artists/${entry.artist?.slug}` : `/rg/beats/${encodeURIComponent(entry.beat?.slug ?? '')}`;
  const detail = kind === 'tracks' ? entry.artist?.stage_name : kind === 'artists' ? 'RG ARTIST' : `RGodBeat · ${entry.rankedTrackCount ?? 0} tracks en Top 23`;
  if (!title) return null;
  const defaultRecorded = kind === 'beats' ? Math.max(1, entry.rankedTrackCount ?? 1) : 1;
  return <Link href={href} prefetch={true} className={`${styles.row} ${entry.rank <= 3 ? styles.top : ''} ${entry.rank === 1 ? styles.champion : ''}`}>
    <span className={styles.rank}>#{String(entry.rank).padStart(2, '0')}</span>
    <div className={styles.identity}>
      <strong>{title}</strong>
      <p>{entry.rank === 1 ? 'LIDERA LA TEMPORADA · ' : ''}{detail}</p>
      <InteractionStrip stats={entry.interactions ?? { recordedCount: defaultRecorded, viewCount: 0, likeCount: 0, commentCount: 0 }} kind={kind} />
    </div>
    <div className={styles.points}>{formatRg(entry.score)} <small>pts</small><Movement movement={entry.movement} isNew={entry.isNew} /></div>
  </Link>;
}
export function ArtistRewards({ rewards, tail }: { rewards: ChartData['rewards']; tail?: ChartData['rewardTail'] }) {
  return <section aria-label="Premios del Top 3 de artistas"><p className={styles.eyebrow}>TOP 3 ARTISTS · PREMIOS DE TEMPORADA</p><div className={styles.rewardGrid}>
    {rewards.map(reward => <article key={reward.place} className={styles.reward}><span className={styles.eyebrow}>#{reward.place}</span><strong>{reward.premiumDays} DÍAS PREMIUM</strong><small>+ REWARD POOL</small></article>)}
  </div>{tail && <p className={styles.muted}>#{tail.firstPlace}–#{tail.lastPlace} comparten el reward pool restante, con peso descendente por posición. El pool real varía por temporada.</p>}</section>;
}
export function Sponsors({ sponsors }: { sponsors: ChartData['sponsors'] }) {
  if (!sponsors.length) return null;
  return <section className={styles.section}><p className={styles.eyebrow}>PRESENTADO POR</p><div className={styles.sponsors}>{sponsors.map((sponsor, index) => {
    const content = <>{sponsor.logoUrl && <Image src={sponsor.logoUrl} alt="" width={56} height={40} sizes="56px" loading="lazy" />}<div><strong>{sponsor.name}</strong><small>{sponsor.tier.replaceAll('_', ' ')}</small></div></>;
    return sponsor.websiteUrl ? <a className={styles.sponsor} key={`${sponsor.name}-${index}`} href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer">{content}</a> : <div className={styles.sponsor} key={`${sponsor.name}-${index}`}>{content}</div>;
  })}</div></section>;
}
export function HowToCompete() {
  return <section className={styles.section}><p className={styles.eyebrow}>TU MÚSICA. TU TEMPORADA.</p><h2>GRABA. PUBLICA. GANA.</h2><div className={styles.learnGrid}>
    <div><span className={styles.eyebrow}>01 / GRABA</span><h3>Empieza en Studio.</h3><p>Elige tu beat favorito del catálogo de RGodbeat y graba tus voces directamente en Studio.</p></div>
    <div><span className={styles.eyebrow}>02 / PUBLICA</span><h3>Llega a YouTube y suma puntos.</h3><p>Publica tu tema desde Studio en el canal oficial. Las tres primeras canciones de cada bloque de 12 horas suman 23, 7 y 4 puntos, y la misma cantidad en RG. Un mismo audio recibe una sola recompensa.</p></div>
    <div><span className={styles.eyebrow}>03 / GANA</span><h3>Compite por el Top 3.</h3><p>Los tres primeros artistas ganan días Premium y parte del Reward Pool. Cada 14 días, una nueva oportunidad.</p></div>
  </div><div className={styles.links}><Link className={styles.button} href="/studio">PUBLICAR EN RGODBEAT STUDIO</Link></div></section>;
}
export function Performance({ data, seasonNumber }: { data: SeasonPerformance; seasonNumber: number }) {
  return <section aria-label="Rendimiento de temporada" className={styles.performance}><div><small>SEASON {String(seasonNumber).padStart(2, '0')}</small><strong>{data.rank ? `#${String(data.rank).padStart(2, '0')}` : 'Sin posición'}</strong><Movement movement={data.movement} isNew={data.isNew} /></div><div><small>SEASON SCORE</small><strong>{formatRg(data.score)} <small>pts</small></strong></div></section>;
}
export function ProductFrame({ children }: { children: ReactNode }) {
  return <div className={styles.page}><Navbar /><main className={styles.main}><Link className={styles.textLink} href={RG_CHART_PATH}>← RG TOP 23</Link>{children}</main><Footer /></div>;
}

export function ProfileUnavailable({ href }: { href: string }) {
  return <ProductFrame><section className={`${styles.section} ${styles.empty}`} role="alert"><p className={styles.eyebrow}>RG TOP 23</p><h1>El perfil volverá en un momento.</h1><p>No pudimos cargar sus datos. Inténtalo de nuevo.</p><RetryRouteButton key={href} className={styles.button}>VOLVER A INTENTAR</RetryRouteButton></section></ProductFrame>;
}
