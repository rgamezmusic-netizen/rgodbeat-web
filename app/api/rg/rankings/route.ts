import { NextResponse } from 'next/server';
import { getRgSeasonRankings } from '@/lib/rg/phase2/rankings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getRgSeasonRankings();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' } });
  } catch (error) {
    console.error('[RG rankings]', error instanceof Error ? error.message : 'UNKNOWN');
    return NextResponse.json({ error: 'Las clasificaciones RG todavía no están disponibles.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
