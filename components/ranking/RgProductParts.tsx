import Link from 'next/link';
import { RetryRouteButton } from '@/components/ui/RetryRouteButton';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Navbar, Footer } from '@/components/layout';
import { computeArtistMedalTally, formatRg, medalPlaceLabel, movementLabel, RG_CHART_PATH } from '@/lib/rg/product/presentation';
import type {
  ChartData,
  ChartEntry,
  RgArtistMedalTally,
  RgHallOfFameEntry,
  RgInteractionStats,
  RgMedalPlace,
  SeasonPerformance,
} from '@/lib/rg/product/types';
import styles from './RgProduct.module.css';

export function RgStudioTrophyIcon({
  place,
  size = 'md',
}: {
  place: RgMedalPlace;
  size?: 'sm' | 'md' | 'lg';
}) {
  const px = size === 'sm' ? 22 : size === 'lg' ? 46 : 32;
  if (place === 1) {
    // Custom Piece of RG Studio: 24K Gold Condenser Microphone on a Vinyl & Studio Console Pedestal
    return (
      <span
        className={`${styles.trophyIconWrap} ${styles.trophyGold} ${styles[`trophy_${size}`]}`}
        title="Trofeo Pieza de RG Studio · 1.er Puesto (#1)"
        role="img"
        aria-label="Trofeo Pieza de RG Studio"
      >
        <svg width={px} height={px} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="rgGoldGrad" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFF5B8" />
              <stop offset="35%" stopColor="#E4BE63" />
              <stop offset="70%" stopColor="#B88928" />
              <stop offset="100%" stopColor="#F5D97E" />
            </linearGradient>
            <linearGradient id="rgBaseGrad" x1="10" y1="34" x2="38" y2="46" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#26221A" />
              <stop offset="100%" stopColor="#0E0F11" />
            </linearGradient>
          </defs>
          {/* Studio acoustic wave halo */}
          <path d="M10 15C7.5 18 7.5 22 10 25" stroke="url(#rgGoldGrad)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
          <path d="M38 15C40.5 18 40.5 22 38 25" stroke="url(#rgGoldGrad)" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
          {/* Condenser microphone capsule */}
          <rect x="17.5" y="5" width="13" height="20" rx="6.5" fill="url(#rgGoldGrad)" stroke="#FFF6C2" strokeWidth="1" />
          {/* Studio grille mesh lines */}
          <line x1="19" y1="10" x2="29" y2="10" stroke="#5A400C" strokeWidth="1.1" opacity="0.55" />
          <line x1="18.5" y1="13.5" x2="29.5" y2="13.5" stroke="#5A400C" strokeWidth="1.1" opacity="0.55" />
          <line x1="19" y1="17" x2="29" y2="17" stroke="#5A400C" strokeWidth="1.2" opacity="0.7" />
          {/* Shockmount U-cradle */}
          <path d="M14 17.5V19C14 24.5228 18.4772 29 24 29C29.5228 29 34 24.5228 34 19V17.5" stroke="url(#rgGoldGrad)" strokeWidth="2.4" strokeLinecap="round" />
          {/* Stand pillar */}
          <rect x="22.3" y="29" width="3.4" height="6" fill="url(#rgGoldGrad)" />
          {/* Vinyl disc + RG Studio monolith pedestal */}
          <ellipse cx="24" cy="36" rx="12" ry="2.8" fill="url(#rgGoldGrad)" />
          <path d="M13 36.5H35L37 43.5C37 44.3 36.3 45 35.4 45H12.6C11.7 45 11 44.3 11 43.5L13 36.5Z" fill="url(#rgBaseGrad)" stroke="url(#rgGoldGrad)" strokeWidth="1.5" />
          <text x="24" y="42.6" textAnchor="middle" fill="#FFE699" fontSize="6.3" fontWeight="900" fontFamily="system-ui, sans-serif" letterSpacing="0.06em">RG #1</text>
        </svg>
      </span>
    );
  }

  const isSilver = place === 2;
  const gradId = isSilver ? 'rgSilverGrad' : 'rgBronzeGrad';
  const ribbonColor = isSilver ? '#5B6B82' : '#7C4728';
  const strokeColor = isSilver ? '#E2E8F0' : '#FDBA74';
  const textColor = isSilver ? '#0F172A' : '#2A1205';

  return (
    <span
      className={`${styles.trophyIconWrap} ${isSilver ? styles.trophySilver : styles.trophyBronze} ${styles[`trophy_${size}`]}`}
      title={isSilver ? 'Medalla de Plata RG Studio · 2.º Puesto (#2)' : 'Medalla de Bronce RG Studio · 3.er Puesto (#3)'}
      role="img"
      aria-label={isSilver ? 'Medalla de Plata RG Studio' : 'Medalla de Bronce RG Studio'}
    >
      <svg width={px} height={px} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {isSilver ? (
            <linearGradient id={gradId} x1="10" y1="12" x2="38" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="45%" stopColor="#CBD5E1" />
              <stop offset="80%" stopColor="#64748B" />
              <stop offset="100%" stopColor="#E2E8F0" />
            </linearGradient>
          ) : (
            <linearGradient id={gradId} x1="10" y1="12" x2="38" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFEDD5" />
              <stop offset="45%" stopColor="#D97706" />
              <stop offset="80%" stopColor="#7C2D12" />
              <stop offset="100%" stopColor="#FDBA74" />
            </linearGradient>
          )}
        </defs>
        {/* Studio Medal Ribbon */}
        <path d="M16 4H23L26 16H19L16 4Z" fill={ribbonColor} opacity="0.9" />
        <path d="M32 4H25L22 16H29L32 4Z" fill={ribbonColor} />
        {/* Outer Medal Disc */}
        <circle cx="24" cy="28" r="14" fill={`url(#${gradId})`} stroke={strokeColor} strokeWidth="1.5" />
        {/* Studio Vinyl Groove Ring */}
        <circle cx="24" cy="28" r="10.5" stroke={textColor} strokeWidth="1" strokeDasharray="3 2" opacity="0.45" />
        {/* Rank Emblem */}
        <text x="24" y="32.5" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="900" fontFamily="system-ui, sans-serif">
          #{place}
        </text>
      </svg>
    </span>
  );
}

export function ArtistMedalStrip({
  medals,
  liveRank,
  showZeroState = false,
}: {
  medals?: RgArtistMedalTally | null;
  liveRank?: number | null;
  showZeroState?: boolean;
}) {
  const hasHistorical = Boolean(medals && medals.total > 0);
  const isLiveTop3 = liveRank === 1 || liveRank === 2 || liveRank === 3;
  if (!hasHistorical && !isLiveTop3 && !showZeroState) return null;

  return (
    <div className={styles.medalStrip} aria-label="Medallas y trofeos RG Studio">
      {isLiveTop3 && (
        <span
          className={`${styles.medalBadge} ${
            liveRank === 1 ? styles.medalBadgeGold : liveRank === 2 ? styles.medalBadgeSilver : styles.medalBadgeBronze
          }`}
        >
          <RgStudioTrophyIcon place={liveRank as RgMedalPlace} size="sm" />
          <span>{medalPlaceLabel(liveRank)} · #{liveRank}</span>
        </span>
      )}
      {hasHistorical && medals && (
        <>
          {medals.gold > 0 && (
            <span className={`${styles.medalBadge} ${styles.medalBadgeGold}`} title="Trofeos Pieza de RG Studio (#1) ganados">
              <RgStudioTrophyIcon place={1} size="sm" />
              <span>×{formatRg(medals.gold)} TROFEO RG</span>
            </span>
          )}
          {medals.silver > 0 && (
            <span className={`${styles.medalBadge} ${styles.medalBadgeSilver}`} title="Medallas de Plata (#2) ganadas">
              <RgStudioTrophyIcon place={2} size="sm" />
              <span>×{formatRg(medals.silver)} PLATA</span>
            </span>
          )}
          {medals.bronze > 0 && (
            <span className={`${styles.medalBadge} ${styles.medalBadgeBronze}`} title="Medallas de Bronce (#3) ganadas">
              <RgStudioTrophyIcon place={3} size="sm" />
              <span>×{formatRg(medals.bronze)} BRONCE</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

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
  const isTop3 = entry.rank === 1 || entry.rank === 2 || entry.rank === 3;
  return <Link href={href} prefetch={true} className={`${styles.row} ${entry.rank <= 3 ? styles.top : ''} ${entry.rank === 1 ? styles.champion : ''} ${entry.rank === 2 ? styles.runnerUp : ''} ${entry.rank === 3 ? styles.thirdPlace : ''}`}>
    <span className={styles.rank}>
      <span>#{String(entry.rank).padStart(2, '0')}</span>
      {isTop3 && <RgStudioTrophyIcon place={entry.rank as RgMedalPlace} size="sm" />}
    </span>
    <div className={styles.identity}>
      <strong>{title}</strong>
      <p>{entry.rank === 1 ? 'LIDERA LA TEMPORADA · ' : ''}{detail}</p>
      {(isTop3 || (entry.medals && entry.medals.total > 0)) && (
        <ArtistMedalStrip
          medals={entry.medals}
          liveRank={isTop3 ? entry.rank : null}
        />
      )}
      <InteractionStrip stats={entry.interactions ?? { recordedCount: defaultRecorded, viewCount: 0, likeCount: 0, commentCount: 0 }} kind={kind} />
    </div>
    <div className={styles.points}>{formatRg(entry.score)} <small>pts</small><Movement movement={entry.movement} isNew={entry.isNew} /></div>
  </Link>;
}
export function ArtistRewards({ rewards }: { rewards: ChartData['rewards']; tail?: ChartData['rewardTail'] }) {
  return <section aria-label="Premios del Top 3 de artistas"><p className={styles.eyebrow}>TOP 3 ARTISTS · PREMIOS DE TEMPORADA</p><div className={styles.rewardGrid}>
    {rewards.map(reward => {
      const isTop3 = reward.place === 1 || reward.place === 2 || reward.place === 3;
      return (
        <article key={reward.place} className={styles.reward}>
          <div className={styles.rewardHead}>
            <span className={styles.eyebrow}>#{reward.place}</span>
            {isTop3 && <RgStudioTrophyIcon place={reward.place as RgMedalPlace} size="md" />}
          </div>
          <span className={styles.rewardMedalTitle}>{medalPlaceLabel(reward.place)}</span>
          <strong>{reward.premiumDays} DÍAS PREMIUM</strong>
          <small>+ REWARD POOL · SALÓN DE LA FAMA</small>
        </article>
      );
    })}
  </div></section>;
}

export function HallOfFame({
  entries = [],
  currentArtists = [],
  currentTracks = [],
  seasonNumber,
}: {
  entries?: RgHallOfFameEntry[];
  currentArtists?: ChartEntry[];
  currentTracks?: ChartEntry[];
  seasonNumber: number;
}) {
  // Derive live Top 3 contenders for current season preview
  const livePodium = (currentArtists.length ? currentArtists : currentTracks)
    .filter(item => item.rank === 1 || item.rank === 2 || item.rank === 3)
    .slice(0, 3);

  return (
    <section className={styles.section} aria-label="Salón de la Fama y Medallero Histórico Infinito">
      <div className={styles.hofHeader}>
        <div>
          <p className={styles.eyebrow}>SALÓN DE LA FAMA · MEDALLERO INFINITO</p>
          <h2>LOS CAMPEONES QUEDAN PARA SIEMPRE.</h2>
        </div>
      </div>

      {/* Showcase of the 3 Official RG Studio Pieces */}
      <div className={styles.hofPiecesGrid} aria-label="Insignias oficiales del Salón de la Fama">
        <div className={`${styles.hofPieceCard} ${styles.hofPieceGold}`}>
          <RgStudioTrophyIcon place={1} size="lg" />
          <div>
            <span className={styles.eyebrow}>1.ER PUESTO · #1</span>
            <strong>Trofeo Pieza de RG Studio</strong>
          </div>
        </div>
        <div className={`${styles.hofPieceCard} ${styles.hofPieceSilver}`}>
          <RgStudioTrophyIcon place={2} size="lg" />
          <div>
            <span className={styles.eyebrow}>2.º PUESTO · #2</span>
            <strong>Medalla de Plata RG Studio</strong>
          </div>
        </div>
        <div className={`${styles.hofPieceCard} ${styles.hofPieceBronze}`}>
          <RgStudioTrophyIcon place={3} size="lg" />
          <div>
            <span className={styles.eyebrow}>3.ER PUESTO · #3</span>
            <strong>Medalla de Bronce RG Studio</strong>
          </div>
        </div>
      </div>

      {/* Live Podium in Dispute for the Active Season */}
      {livePodium.length > 0 && (
        <div className={styles.hofLiveBox}>
          <div className={styles.hofSubHeader}>
            <span className={styles.eyebrow}>PODIO EN DISPUTA · SEASON {String(seasonNumber).padStart(2, '0')}</span>
          </div>
          <div className={styles.hofPodiumGrid}>
            {livePodium.map(contender => {
              const name = contender.artist?.stage_name || contender.track?.title || 'RG Artist';
              const slug = contender.artist?.slug;
              const href = slug ? `/rg/artists/${slug}` : `/rg/tracks/${contender.entityId}`;
              const place = contender.rank as RgMedalPlace;
              return (
                <Link key={`${contender.entityId}-${contender.rank}`} href={href} className={`${styles.hofPodiumCard} ${place === 1 ? styles.hofPodiumGold : place === 2 ? styles.hofPodiumSilver : styles.hofPodiumBronze}`}>
                  <div className={styles.hofPodiumTop}>
                    <RgStudioTrophyIcon place={place} size="md" />
                    <span className={styles.hofPlaceTag}>#{place} · {medalPlaceLabel(place)}</span>
                  </div>
                  <strong className={styles.hofArtistName}>{name}</strong>
                  {contender.track?.title && contender.artist?.stage_name && (
                    <small className={styles.hofTrackHint}>Track: {contender.track.title}</small>
                  )}
                  <div className={styles.hofScoreRow}>
                    <span>{formatRg(contender.score)} pts</span>
                    {contender.medals && contender.medals.total > 0 && (
                      <span>{formatRg(contender.medals.total)} {contender.medals.total === 1 ? 'medalla histórica' : 'medallas históricas'}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Infinite All-Time Medal Leaderboard */}
      <div className={styles.hofBoard}>
        <div className={styles.hofSubHeader}>
          <span className={styles.eyebrow}>TOP HISTÓRICO DE MEDALLAS (ACUMULATIVO INFINITO)</span>
        </div>
        {entries.length > 0 ? (
          <div className={styles.hofList}>
            {entries.map(item => (
              <Link key={item.artist.id} href={`/rg/artists/${item.artist.slug}`} className={`${styles.hofRow} ${item.rank === 1 ? styles.hofRowLeader : ''}`}>
                <span className={styles.hofRank}>#{String(item.rank).padStart(2, '0')}</span>
                <div className={styles.hofIdentity}>
                  <strong>{item.artist.stage_name}</strong>
                  <div className={styles.hofSeasonTags}>
                    {item.medals.awards.slice(0, 6).map(award => (
                      <span key={`${award.seasonNumber}-${award.place}`} className={styles.hofSeasonChip}>
                        S{String(award.seasonNumber).padStart(2, '0')} · #{award.place}
                      </span>
                    ))}
                  </div>
                </div>
                <div className={styles.hofCounters} aria-label="Conteo de trofeos y medallas">
                  <span className={`${styles.hofCountPill} ${styles.medalBadgeGold}`} title="Trofeos Pieza de RG Studio (#1)">
                    <RgStudioTrophyIcon place={1} size="sm" />
                    <strong>{formatRg(item.medals.gold)}</strong>
                  </span>
                  <span className={`${styles.hofCountPill} ${styles.medalBadgeSilver}`} title="Medallas de Plata (#2)">
                    <RgStudioTrophyIcon place={2} size="sm" />
                    <strong>{formatRg(item.medals.silver)}</strong>
                  </span>
                  <span className={`${styles.hofCountPill} ${styles.medalBadgeBronze}`} title="Medallas de Bronce (#3)">
                    <RgStudioTrophyIcon place={3} size="sm" />
                    <strong>{formatRg(item.medals.bronze)}</strong>
                  </span>
                  <span className={styles.hofTotalPill}>
                    {formatRg(item.medals.total)} <small>TOTAL</small>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.hofEmpty}>
            <p>El Top 3 de cada temporada cerrada acumula sus medallas aquí.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function ArtistTrophyShowcase({
  medals,
  history = [],
  currentRank,
  seasonNumber,
}: {
  medals?: RgArtistMedalTally | null;
  history?: Array<{ seasonNumber: number; rank: number; score: number }>;
  currentRank: number | null;
  seasonNumber: number;
}) {
  const resolved = medals ?? computeArtistMedalTally(history);
  const isLiveTop3 = currentRank === 1 || currentRank === 2 || currentRank === 3;

  return (
    <section className={styles.trophyShowcase} aria-label="Vitrina de Trofeos y Medallas RG Studio">
      <div className={styles.interactionHeader}>
        <span className={styles.eyebrow}>VITRINA DE HONOR · SALÓN DE LA FAMA RG STUDIO</span>
        {resolved.total > 0 && (
          <span className={styles.interactionSub}>
            {`${formatRg(resolved.total)} ${resolved.total === 1 ? 'GALARDÓN OFICIAL' : 'GALARDONES OFICIALES'}`}
          </span>
        )}
      </div>

      {isLiveTop3 && (
        <div className={styles.liveMedalBanner}>
          <RgStudioTrophyIcon place={currentRank as RgMedalPlace} size="md" />
          <div>
            <span className={styles.eyebrow}>EN ZONA DE PODIO · SEASON {String(seasonNumber).padStart(2, '0')}</span>
            <strong> Compitiendo hoy en el puesto #{currentRank} ({medalPlaceLabel(currentRank)})</strong>
          </div>
        </div>
      )}

      <div className={styles.trophyCabinetGrid}>
        <div className={`${styles.trophyCabinetCard} ${resolved.gold > 0 ? styles.hofPieceGold : ''}`}>
          <RgStudioTrophyIcon place={1} size="md" />
          <div>
            <small>TROFEO PIEZA RG STUDIO (#1)</small>
            <strong>{formatRg(resolved.gold)}</strong>
          </div>
        </div>
        <div className={`${styles.trophyCabinetCard} ${resolved.silver > 0 ? styles.hofPieceSilver : ''}`}>
          <RgStudioTrophyIcon place={2} size="md" />
          <div>
            <small>MEDALLA DE PLATA (#2)</small>
            <strong>{formatRg(resolved.silver)}</strong>
          </div>
        </div>
        <div className={`${styles.trophyCabinetCard} ${resolved.bronze > 0 ? styles.hofPieceBronze : ''}`}>
          <RgStudioTrophyIcon place={3} size="md" />
          <div>
            <small>MEDALLA DE BRONCE (#3)</small>
            <strong>{formatRg(resolved.bronze)}</strong>
          </div>
        </div>
      </div>

      {resolved.awards.length > 0 && (
        <div className={styles.awardChipsWrap}>
          {resolved.awards.map(award => (
            <span
              key={`${award.seasonNumber}-${award.place}`}
              className={`${styles.medalBadge} ${
                award.place === 1 ? styles.medalBadgeGold : award.place === 2 ? styles.medalBadgeSilver : styles.medalBadgeBronze
              }`}
            >
              <RgStudioTrophyIcon place={award.place} size="sm" />
              <span>SEASON {String(award.seasonNumber).padStart(2, '0')} · #{award.place} {medalPlaceLabel(award.place)} ({formatRg(award.score)} pts)</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
export function Sponsors({ sponsors }: { sponsors: ChartData['sponsors'] }) {
  if (!sponsors.length) return null;
  return <section className={styles.section}><p className={styles.eyebrow}>PRESENTADO POR</p><div className={styles.sponsors}>{sponsors.map((sponsor, index) => {
    const content = <>{sponsor.logoUrl && <Image src={sponsor.logoUrl} alt="" width={56} height={40} sizes="56px" loading="lazy" />}<div><strong>{sponsor.name}</strong><small>{sponsor.tier.replaceAll('_', ' ')}</small></div></>;
    return sponsor.websiteUrl ? <a className={styles.sponsor} key={`${sponsor.name}-${index}`} href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer">{content}</a> : <div className={styles.sponsor} key={`${sponsor.name}-${index}`}>{content}</div>;
  })}</div></section>;
}
export function HowToCompete() {
  return <section className={styles.section}><h2>GRABA. PUBLICA. GANA.</h2><div className={styles.learnGrid}>
    <div><span className={styles.eyebrow}>01 / GRABA</span><h3>Empieza en Studio.</h3></div>
    <div><span className={styles.eyebrow}>02 / PUBLICA</span><h3>23, 7 y 4 pts + RG en YouTube.</h3></div>
    <div><span className={styles.eyebrow}>03 / GANA</span><h3>Top 3 cada 14 días + Medallas.</h3></div>
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
