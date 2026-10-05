import type { Metadata } from 'next';
import { Navbar, Footer } from '@/components/layout';
import { AtmosphericBackground } from '@/components/atmosphere';
import { RgSeasonRankingClient } from '@/components/ranking/RgSeasonRankingClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'RG TOP 23 — Temporada RG Score | RGODBEAT',
  description: 'Clasificaciones por temporada de tracks, artistas y beats con actividad verificada.',
};

export default function RgSeasonRankingPage() {
  return <div className="min-h-screen bg-[#09090d]"><AtmosphericBackground theme="default" intensity="high" enableStars={true} starDensity="high" animate={true} /><Navbar /><RgSeasonRankingClient /><Footer /></div>;
}
