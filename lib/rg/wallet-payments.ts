import 'server-only';
import type Stripe from 'stripe';
import { createCommerceAdminClient } from '@/lib/commerce/admin-client';

/** Called only with a session retrieved from Stripe or a verified webhook. */
export async function fulfillRgTopup(session: Stripe.Checkout.Session) {
  if (session.metadata?.type !== 'rg_wallet_topup' || session.payment_status !== 'paid'
    || session.mode !== 'payment' || !session.id.startsWith('cs_')) throw new Error('RG_TOPUP_PAYMENT_UNVERIFIED');
  const db = createCommerceAdminClient();
  const topupId = session.metadata.topupId;
  const { data: topup, error } = await db.from('rg_wallet_topups').select('*').eq('id', topupId).maybeSingle();
  if (error || !topup || topup.stripe_session_id !== session.id || session.client_reference_id !== topup.id
    || session.currency !== topup.currency || session.amount_total !== topup.amount_cents
    || session.metadata.userId !== topup.user_id) throw new Error('RG_TOPUP_SNAPSHOT_MISMATCH');
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const credit = await db.rpc('rg_credit_wallet_topup', {
    p_topup_id: topup.id, p_session_id: session.id, p_payment_intent_id: paymentIntentId,
    p_amount_cents: session.amount_total, p_currency: session.currency,
  });
  if (credit.error) throw new Error('RG_TOPUP_CREDIT_FAILED');
  const final = await db.from('rg_wallet_topups').select('amount_rg,reversed_rg,status,credited_at').eq('id', topup.id).single();
  if (final.error || !final.data || (!final.data.credited_at && final.data.status !== 'reversed')) throw new Error('RG_TOPUP_CREDIT_UNCONFIRMED');
  return { topupId: topup.id, amountRg: Number(final.data.amount_rg) - Number(final.data.reversed_rg || 0), reversed: final.data.status === 'reversed' };
}

/** True means this Stripe payment belongs to RG, so beat fulfillment must skip it. */
export async function reverseRgTopup(stripe: Stripe, paymentIntentId: string, reversedCents: number, dispute?: { amountCents: number; eventCreated: number }) {
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 2 });
  const session = sessions.data.find(s => s.metadata?.type === 'rg_wallet_topup');
  if (!session) return false;
  if (sessions.data.length !== 1) throw new Error('RG_TOPUP_SESSION_AMBIGUOUS');
  const db = createCommerceAdminClient();
  const { data: topup, error } = await db.from('rg_wallet_topups').select('id,stripe_session_id,amount_cents,user_id')
    .eq('id', session.metadata!.topupId).maybeSingle();
  if (error || !topup || topup.stripe_session_id !== session.id || session.client_reference_id !== topup.id
    || session.amount_total !== topup.amount_cents || session.metadata!.userId !== topup.user_id) throw new Error('RG_TOPUP_REVERSAL_MISMATCH');
  const reversal = dispute
    ? await db.rpc('rg_reconcile_wallet_topup', { p_topup_id: topup.id, p_refunded_cents: reversedCents, p_dispute_cents: dispute.amountCents, p_event_created: dispute.eventCreated })
    : await db.rpc('rg_reverse_wallet_topup', { p_topup_id: topup.id, p_reversed_cents: reversedCents });
  if (reversal.error) throw new Error('RG_TOPUP_REVERSAL_FAILED');
  return true;
}
