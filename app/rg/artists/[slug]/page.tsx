import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArtistProfile } from '@/lib/rg/product/profiles';
import { Performance, ProductFrame } from '@/components/ranking/RgProductParts';
import { RgMemberCard } from '@/components/ranking/RgMemberCard';
import { formatRg } from '@/lib/rg/product/presentation';
import styles from '@/components/ranking/RgProduct.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'RG Artist | RGodBeat' };
export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getArtistProfile((await params).slug);
  if (!data) notFound();
  return <ProductFrame><header className={styles.section}><p className={styles.eyebrow}>RG ARTIST</p><h1 className={styles.profileTitle}>{data.artist.stage_name}</h1>{data.artist.bio && <p className={styles.muted}>{data.artist.bio}</p>}<Performance data={data.performance} seasonNumber={data.seasonNumber} /></header>
    <section className={styles.section}><p className={styles.eyebrow}>LA MÚSICA</p><h2>Tracks publicados</h2>{data.tracks.length ? data.tracks.map(track => <Link className={styles.trackLink} key={track.id} href={`/rg/tracks/${track.id}`}>{track.title} ↗</Link>) : <p className={styles.muted}>Su próximo track todavía está por llegar.</p>}<p className={styles.footnote}>Hasta 24 tracks publicados. Los borradores son privados.</p></section>
    <section className={styles.section}><p className={styles.eyebrow}>SU HISTORIA EN EL CHART</p><h2>Cada temporada deja huella.</h2>{data.history.length ? data.history.map(row => <p key={row.seasonNumber} className={styles.trackLink}>SEASON {String(row.seasonNumber).padStart(2, '0')} · #{row.rank} · {formatRg(row.score)} pts</p>) : <p className={styles.muted}>Todavía no hay posiciones de temporadas completadas.</p>}<p className={styles.footnote}>Resultados de las últimas seis temporadas completadas.</p></section><RgMemberCard />
  </ProductFrame>;
}
