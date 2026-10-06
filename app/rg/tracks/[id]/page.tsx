import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTrackProfile } from '@/lib/rg/product/profiles';
import { Performance, ProductFrame } from '@/components/ranking/RgProductParts';
import { formatRg } from '@/lib/rg/product/presentation';
import styles from '@/components/ranking/RgProduct.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'RG Track | RGodBeat' };
export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const data = await getTrackProfile((await params).id);
  if (!data) notFound();
  return <ProductFrame><header className={styles.section}><p className={styles.eyebrow}>RG TRACK</p><h1 className={styles.profileTitle}>{data.track.title}</h1><Link className={styles.textLink} href={`/rg/artists/${data.artist.slug}`}>{data.artist.stage_name}</Link><Performance data={data.performance} seasonNumber={data.seasonNumber} /></header>
    {data.beat && <section className={styles.section}><p className={styles.eyebrow}>EL BEAT DETRÁS DEL TRACK</p><h2>{data.beat.title}</h2><p className={styles.muted}>Su actividad también mueve este beat en el chart.</p><Link className={styles.button} href={`/rg/beats/${encodeURIComponent(data.beat.slug)}`}>DESCUBRIR EL BEAT</Link></section>}
    <section className={styles.section}><p className={styles.eyebrow}>LA PUBLICACIÓN</p>{data.publication ? <><h2>Escúchalo en YouTube.</h2><a className={styles.button} href={data.publication.url} target="_blank" rel="noopener noreferrer">VER EN YOUTUBE ↗</a>{data.publication.viewCount !== null && <p className={styles.muted}>{formatRg(data.publication.viewCount)} vistas verificadas · Actualizado {new Date(data.publication.observedAt!).toLocaleDateString('es-MX', { timeZone: 'UTC' })}</p>}{data.publication.milestoneCount > 0 && <p className={styles.footnote}>{data.publication.milestoneCount} hitos de rendimiento verificados.</p>}</> : <><h2>Su música, a su tiempo.</h2><p className={styles.muted}>Todavía no hay un enlace público verificado para mostrar.</p></>}</section>
  </ProductFrame>;
}
