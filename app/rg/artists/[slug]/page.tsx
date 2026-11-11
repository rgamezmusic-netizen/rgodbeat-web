import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArtistProfile } from '@/lib/rg/product/profiles';
import { ArtistTrophyShowcase, InteractionPanel, InteractionStrip, Performance, ProductFrame, ProfileUnavailable, RgStudioTrophyIcon } from '@/components/ranking/RgProductParts';
import { RgMemberCard } from '@/components/ranking/RgMemberCard';
import { formatRg, medalPlaceLabel } from '@/lib/rg/product/presentation';
import type { RgMedalPlace } from '@/lib/rg/product/types';
import styles from '@/components/ranking/RgProduct.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'RG Artist | RGodBeat' };
export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data;
  try { data = await getArtistProfile(slug); } catch { /* Keep a service failure distinct from an absent artist. */ }
  if (data === undefined) return <ProfileUnavailable href={`/rg/artists/${encodeURIComponent(slug)}`} />;
  if (!data) notFound();
  const artistStats = data.interactions ?? { recordedCount: data.tracks.length, viewCount: 0, likeCount: 0, commentCount: 0 };
  return <ProductFrame><header className={styles.section}><p className={styles.eyebrow}>RG ARTIST</p><h1 className={styles.profileTitle}>{data.artist.stage_name}</h1>{data.artist.bio && <p className={styles.muted}>{data.artist.bio}</p>}<Performance data={data.performance} seasonNumber={data.seasonNumber} /><ArtistTrophyShowcase medals={data.medals} history={data.history} currentRank={data.performance.rank} seasonNumber={data.seasonNumber} /><InteractionPanel stats={artistStats} mode="artist" /></header>
    <section className={styles.section}><p className={styles.eyebrow}>LA MÚSICA</p><h2>Tracks publicados</h2>{data.tracks.length ? data.tracks.map(track => {
      const tStats = data.trackInteractions?.[track.id] ?? { recordedCount: 1, viewCount: 0, likeCount: 0, commentCount: 0 };
      return <Link className={styles.trackLink} key={track.id} href={`/rg/tracks/${track.id}`}>
        <div className={styles.trackLinkRow}>
          <span>{track.title} ↗</span>
          <InteractionStrip stats={tStats} kind="tracks" />
        </div>
      </Link>;
    }) : <p className={styles.muted}>Su próximo track todavía está por llegar.</p>}<p className={styles.footnote}>Hasta 24 tracks publicados. Los borradores son privados.</p></section>
    <section className={styles.section}><p className={styles.eyebrow}>SU HISTORIA EN EL CHART</p><h2>Cada temporada deja huella.</h2>{data.history.length ? data.history.map(row => {
      const isTop3 = row.rank === 1 || row.rank === 2 || row.rank === 3;
      return (
        <p key={row.seasonNumber} className={`${styles.trackLink} ${styles.historyRow}`}>
          <span>SEASON {String(row.seasonNumber).padStart(2, '0')} · #{row.rank} · {formatRg(row.score)} pts</span>
          {isTop3 && (
            <span className={`${styles.medalBadge} ${row.rank === 1 ? styles.medalBadgeGold : row.rank === 2 ? styles.medalBadgeSilver : styles.medalBadgeBronze}`}>
              <RgStudioTrophyIcon place={row.rank as RgMedalPlace} size="sm" />
              <span>{medalPlaceLabel(row.rank)}</span>
            </span>
          )}
        </p>
      );
    }) : <p className={styles.muted}>Todavía no hay posiciones de temporadas completadas.</p>}<p className={styles.footnote}>Resultados históricos de temporadas completadas y medallas acumuladas.</p></section><RgMemberCard />
  </ProductFrame>;
}
