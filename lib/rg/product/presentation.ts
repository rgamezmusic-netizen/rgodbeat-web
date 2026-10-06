import type { RankingKind } from '@/lib/rg/phase2/engine';

export const RG_CHART_PATH = '/ranking/season';
export function formatRg(value: number) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(value);
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
