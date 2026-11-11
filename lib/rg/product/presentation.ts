import type { RankingKind } from '@/lib/rg/phase2/engine';
import type { PublicArtist, RgArtistMedalTally, RgHallOfFameEntry, RgMedalPlace, RgSeasonMedalAward } from './types';

export const RG_CHART_PATH = '/ranking/season';
export function formatRg(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value);
}
export function medalPlaceLabel(place: number): string {
  if (place === 1) return 'TROFEO PIEZA RG STUDIO';
  if (place === 2) return 'MEDALLA DE PLATA';
  if (place === 3) return 'MEDALLA DE BRONCE';
  return `#${place}`;
}
export function computeArtistMedalTally(
  history: Array<{ seasonNumber: number; rank: number; score: number }>,
): RgArtistMedalTally {
  const awards: RgSeasonMedalAward[] = [];
  let gold = 0;
  let silver = 0;
  let bronze = 0;
  let totalPoints = 0;
  for (const row of history) {
    const r = Number(row.rank);
    const s = Math.max(0, Number(row.score) || 0);
    if (r === 1 || r === 2 || r === 3) {
      const place = r as RgMedalPlace;
      awards.push({ seasonNumber: Number(row.seasonNumber), place, score: s });
      if (place === 1) gold += 1;
      else if (place === 2) silver += 1;
      else bronze += 1;
      totalPoints += s;
    }
  }
  awards.sort((a, b) => b.seasonNumber - a.seasonNumber || a.place - b.place);
  return {
    gold,
    silver,
    bronze,
    total: gold + silver + bronze,
    totalPoints,
    awards,
  };
}
export function buildHallOfFame(
  artists: Array<{
    artist: PublicArtist;
    history: Array<{ seasonNumber: number; rank: number; score: number }>;
    currentSeasonRank?: number | null;
  }>,
): RgHallOfFameEntry[] {
  const candidates = artists
    .map((item) => ({
      artist: item.artist,
      medals: computeArtistMedalTally(item.history),
      currentSeasonRank: item.currentSeasonRank ?? null,
    }))
    .filter((item) => item.medals.total > 0);
  candidates.sort(
    (a, b) =>
      b.medals.gold - a.medals.gold ||
      b.medals.silver - a.medals.silver ||
      b.medals.bronze - a.medals.bronze ||
      b.medals.totalPoints - a.medals.totalPoints ||
      a.artist.stage_name.localeCompare(b.artist.stage_name) ||
      a.artist.id.localeCompare(b.artist.id),
  );
  return candidates.map((item, idx) => ({
    rank: idx + 1,
    artist: item.artist,
    medals: item.medals,
    currentSeasonRank: item.currentSeasonRank,
  }));
}
export function seasonCountdown(endsAt: string, serverTime: string, elapsedMs = 0) {
  const remaining = Date.parse(endsAt) - Date.parse(serverTime) - Math.max(0, elapsedMs);
  if (!Number.isFinite(remaining)) return 'TEMPORADA EN PREPARACIÓN';
  if (remaining <= 0) return 'TEMPORADA CERRADA';
  if (remaining >= 86_400_000) return `${Math.ceil(remaining / 86_400_000)} DÍAS RESTANTES`;
  if (remaining >= 3_600_000) return `${Math.ceil(remaining / 3_600_000)} HORAS RESTANTES`;
  return `${Math.max(1, Math.ceil(remaining / 60_000))} MINUTOS RESTANTES`;
}
export function movementLabel(movement: number | null, isNew: boolean) {
  if (isNew) return 'NEW';
  if (movement === null || movement === 0) return '—';
  return `${movement > 0 ? '↑' : '↓'} ${Math.abs(movement)}`;
}
export const emptyRanking = {
  tracks: { title: 'La próxima canción puede ser la tuya.', detail: 'Todavía no hay tracks en esta temporada. Publica desde RGodBeat Studio para entrar.', cta: 'CREAR EN STUDIO', href: '/studio' },
  artists: { title: 'El próximo nombre puede ser el tuyo.', detail: 'La temporada acaba de empezar. Publica con tu perfil RG Artist y compite cada 14 días.', cta: 'ABRIR STUDIO', href: '/studio' },
  beats: { title: 'Un beat. Muchas historias.', detail: 'Cuando los artistas compiten con un beat del catálogo, su actividad también lo mueve aquí.', cta: 'EXPLORAR BEATS', href: '/beats' },
} satisfies Record<RankingKind, { title: string; detail: string; cta: string; href: string }>;

export function safeHttpsUrl(value: string | null | undefined) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
