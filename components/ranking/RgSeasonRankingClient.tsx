'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Clock3, Trophy } from 'lucide-react';

type RankingKind = 'tracks' | 'artists' | 'beats';
type Entry = { entityId: string; rank: number; score: number; previousRank: number | null; movement: number | null; isNew: boolean; track?: { title: string; beat_id: string | null } | null; artist?: { stage_name: string; slug: string } | null; beat?: { title: string; slug: string; cover_path: string | null } | null };
type Payload = { season: { name: string; season_number: number; ends_at: string }; rewardPoolRg: number; sponsors: Array<{ visibility_tier: string; sponsor: { name: string; website_url: string | null } | null }>; serverTime: string; rankings: Record<RankingKind, Entry[]> };
const tabs: { id: RankingKind; label: string }[] = [
  { id: 'tracks', label: 'TRACKS' }, { id: 'artists', label: 'ARTISTS' }, { id: 'beats', label: 'BEATS' },
];

function formatCountdown(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function RgSeasonRankingClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [kind, setKind] = useState<RankingKind>('tracks');
  const [error, setError] = useState('');
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/rg/rankings', { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'No se pudo cargar la clasificación.');
        if (active) { setData(body); setError(''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar la clasificación.'); }
    };
    void load();
    const reload = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60_000);
    const clock = setInterval(() => setTick(Date.now()), 1000);
    return () => { active = false; clearInterval(reload); clearInterval(clock); };
  }, []);
  const entries = data?.rankings[kind] ?? [];
  const remaining = data ? new Date(data.season.ends_at).getTime() - (tick ?? Date.parse(data.serverTime)) : 0;
  return <main className="relative z-10 mx-auto min-h-[70vh] w-full max-w-6xl px-5 py-12 text-white sm:px-8">
    <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="mb-2 text-xs font-bold tracking-[0.24em] text-amber-400">RGODBEAT / RG SCORE</p><h1 className="text-3xl font-black tracking-tight sm:text-5xl">RG TOP 23</h1><p className="mt-2 text-sm text-zinc-400">Clasificaciones de actividad verificada. El apoyo económico aumenta el premio, nunca la posición.</p></div>
      {data && <div className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3"><Clock3 size={17} className="text-amber-300" /><div><p className="text-[10px] font-bold tracking-[0.16em] text-amber-200">{data.season.name}</p><p className="font-mono text-sm text-white">{formatCountdown(remaining)} <span className="text-zinc-500">restantes</span></p></div></div>}
    </header>
    {data && <section className="mb-7 flex flex-col gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[10px] font-bold tracking-[0.18em] text-amber-300">REWARD POOL</p><p className="mt-1 font-mono text-2xl font-black text-white">{data.rewardPoolRg.toLocaleString()} <span className="text-sm text-amber-200">RG</span></p></div>
      {data.sponsors.length > 0 && <div className="sm:text-right"><p className="text-[10px] font-bold tracking-[0.18em] text-zinc-500">PRESENTADO POR</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 sm:justify-end">{data.sponsors.map((item, index) => item.sponsor && (item.sponsor.website_url
        ? <a key={`${item.sponsor.name}-${index}`} href={item.sponsor.website_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-zinc-200 hover:text-amber-200">{item.sponsor.name} · {item.visibility_tier.replaceAll('_', ' ')}</a>
        : <span key={`${item.sponsor.name}-${index}`} className="text-sm font-semibold text-zinc-200">{item.sponsor.name} · {item.visibility_tier.replaceAll('_', ' ')}</span>))}</div></div>}
    </section>}
    <nav className="mb-5 flex gap-2" aria-label="Tipo de clasificación">{tabs.map((tab) => <button key={tab.id} onClick={() => setKind(tab.id)} className={`rounded-lg border px-4 py-2 text-xs font-bold tracking-widest transition ${kind === tab.id ? 'border-amber-300 bg-amber-300 text-black' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'}`}>{tab.label}</button>)}</nav>
    {error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-950/30 p-5 text-sm text-red-200">{error}</div>}
    {!error && !data && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-sm text-zinc-400">Cargando la temporada…</div>}
    {data && !error && <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#101015]/90">
      <div className="grid grid-cols-[3.5rem_1fr_auto] gap-3 border-b border-white/10 px-4 py-3 text-[10px] font-bold tracking-[0.18em] text-zinc-500 sm:grid-cols-[4rem_1fr_7rem_7rem] sm:px-6"><span>RANK</span><span>IDENTIDAD</span><span className="hidden sm:block">MOVIMIENTO</span><span className="text-right">RG SCORE</span></div>
      {entries.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">Aún no hay actividad verificada en esta temporada.</p>}
      {entries.map((entry) => {
        const title = kind === 'tracks' ? entry.track?.title : kind === 'artists' ? entry.artist?.stage_name : entry.beat?.title;
        const detail = kind === 'tracks' ? entry.artist?.stage_name || 'Artista RG' : kind === 'artists' ? `@${entry.artist?.slug || ''}` : 'Beat de catálogo RGodBeat';
        return <article key={entry.entityId} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 border-b border-white/[0.06] px-4 py-4 last:border-0 sm:grid-cols-[4rem_1fr_7rem_7rem] sm:px-6">
          <span className={`font-mono text-xl font-black ${entry.rank <= 3 ? 'text-amber-300' : 'text-zinc-400'}`}>{String(entry.rank).padStart(2, '0')}</span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-white sm:text-base">{title || 'Identidad archivada'}</strong>{entry.isNew && <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-emerald-300">NEW</span>}</div><p className="mt-1 truncate text-xs text-zinc-500">{detail}</p></div>
          <span className="hidden items-center gap-1 text-xs text-zinc-400 sm:flex">{entry.previousRank === null ? <span className="text-emerald-300">NEW</span> : entry.movement === 0 ? '—' : <>{entry.movement! > 0 ? <ArrowUp size={13} className="text-emerald-300" /> : <ArrowDown size={13} className="text-rose-300" />}{Math.abs(entry.movement!)}</>}</span>
          <span className="flex items-center justify-end gap-1.5 font-mono text-sm font-bold text-amber-100"><Trophy size={13} className="text-amber-400" />{entry.score.toLocaleString()}</span>
        </article>;
      })}
    </section>}
    <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">RG Score se calcula desde eventos verificados. Comprar RG Coin, patrocinar o contribuir al Reward Pool no suma puntos ni cambia rankings.</p>
  </main>;
}
