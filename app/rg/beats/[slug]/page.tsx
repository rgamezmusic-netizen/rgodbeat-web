import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getBeatProfile } from '@/lib/rg/product/profiles';
import { ChartRow, Performance, ProductFrame, ProfileUnavailable } from '@/components/ranking/RgProductParts';
import styles from '@/components/ranking/RgProduct.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'RG Beat | RGodBeat' };
export default async function BeatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let data;
  try { data = await getBeatProfile(slug); } catch { /* Do not present a service failure as zero activity. */ }
  if (data === undefined) return <ProfileUnavailable href={`/rg/beats/${encodeURIComponent(slug)}`} />;
  if (!data) notFound();
  return <ProductFrame><header className={styles.section}><p className={styles.eyebrow}>RG BEAT · RGODBEAT</p>{data.beat.coverUrl && <Image className={styles.cover} src={data.beat.coverUrl} alt={`Portada de ${data.beat.title}`} width={150} height={150} unoptimized />}<h1 className={styles.profileTitle}>{data.beat.title}</h1><Performance data={data.performance} seasonNumber={data.seasonNumber} /><Link className={styles.button} href={`/beats/${encodeURIComponent(data.beat.slug)}`}>ESCUCHAR / USAR ESTE BEAT</Link></header>
    <section className={styles.section}><p className={styles.eyebrow}>UN BEAT. MUCHAS HISTORIAS.</p><h2>{data.tracks.length} tracks en el Top 23</h2><p className={styles.muted}>La actividad de los tracks que usan este beat también impulsa su posición.</p><div className={styles.list}>{data.tracks.length ? data.tracks.map(entry => <ChartRow key={entry.entityId} entry={entry} kind="tracks" />) : <p className={styles.muted}>Todavía no hay tracks con este beat en el Top 23 de esta temporada.</p>}</div></section>
  </ProductFrame>;
}
