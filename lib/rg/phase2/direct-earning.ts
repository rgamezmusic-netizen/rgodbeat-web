import 'server-only';
import { createPhase2AdminClient } from './database';

/** Separate from Score recording. No wallet/commerce actions can enter this collector. */
export async function reconcileVerifiedRgEarnings(seasonId: string) {
  const db = createPhase2AdminClient();
  const settings = await db.from('rg_economy_config').select('direct_earning_v1_enabled').eq('id', true).single();
  if (settings.error || !settings.data) throw new Error('RG direct earning configuration unavailable.');
  if (!(settings.data as { direct_earning_v1_enabled: boolean }).direct_earning_v1_enabled) return { enabled: false, issued: 0 };
  let issued = 0;
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('rg_score_events').select('id').eq('season_id', seasonId)
      .in('event_type', ['TRACK_PUBLISHED', 'YOUTUBE_VIEW_MILESTONE']).order('id', { ascending: true }).range(offset, offset + 499);
    if (result.error || !result.data) throw new Error('Verified earning evidence unavailable.');
    const events = result.data as Array<{ id: string }>;
    for (const event of events) {
      const award = await db.rpc('rg_award_verified_activity', { p_score_event_id: event.id });
      if (award.error && ['season_issuance_cap_reached', 'rg_outstanding_cap_reached', 'utility_liability_budget_reached'].some(code => award.error?.message?.includes(code))) return { enabled: true, issued, budgetReached: true };
      if (award.error) throw new Error('Verified utility award failed.');
      if (award.data) issued++;
    }
    if (events.length < 500) break;
  }
  return { enabled: true, issued };
}
