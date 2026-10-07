# RG Economy V1 rollout

Code and migrations are prepared locally. Production has not been migrated, credited, gifted or redeemed. No Git push was performed.

## Product and provenance contract

`rg_market_products` is the central price/benefit source. Immutable `(product_key, version)` terms preserve issued passes; only `active` changes. V1 contains MP3 25% / 2,500 RG / 725¢ cap; WAV 25% / 4,500 / 1,225¢; MP3 50% / 5,000 / 1,450¢; WAV 50% / 8,500 / 2,450¢; Beat Pass / 10,000 / one eligible standard MP3 up to the current 2,900¢ benefit; Studio / 3,500 / +30 days. All are one-use, giftable and do not expire. Gift links retain Gift V1's 72-hour expiry and existing resend; an expired link does not expire the entitlement. Exclusive, Unlimited, Stems, Park and custom services have no RG benefit.

The append-only ledger retains every origin. A separate immutable credit/debit allocation table makes earned and season-reward credits spendable. Purchased and ordinary admin credits remain restricted; sponsor/pool credits remain accounting. Non-Market debits consume restricted wallet credits first, then eligible credits. Market debits use only eligible credits. Live allocations use committed credits under the wallet lock, including credits committed after the spending transaction began. Conservative historical allocation uses recorded timestamps and aborts on unmatched debits.

A controlled correction requires an explicit immutable authorization reference and `utility_spendable=true`, recorded with the authorizing database session. Its bounded, idempotent RPC is database-owner-only, not callable by the service role or public routes. No historical admin credit is retroactively approved. Service-role column permissions prevent directly setting the override flag. Existing pass IDs, statuses, ledger references and legacy RPC signatures survive.

`rg_market_liabilities` reports available/reserved passes, unclaimed gifts and remaining Studio obligations, without double-counting unclaimed utility gifts and their reserved source pass. A private exposure function includes spendable balances, future pool/reserve awards and outstanding benefits. Direct issuance needs an explicitly configured `maximum_utility_exposure_cents`; its default is zero. All monetary calculations here are private accounting; no wallet API exposes exchange rates or ledger internals.

## Commerce and gifts

A single owned pass is reserved against an immutable intent. The server validates the real published beat and USD catalog price, then freezes `min(floor(percentage × price in cents), benefit cap)` and the USD remainder. Stripe charges only the remainder. A fully covered Beat/Studio redemption calls the existing fulfillment pipeline without contacting Stripe. Completion consumes the pass after the order and intent complete. Retries keep frozen cents and request facts; prices changing later do not reprice an existing intent.

Canceling a partially paid checkout expires/verifies its Stripe session before releasing its reservation. Unlinked sessions are not released until an idempotent retry links them. A verified/processing payment cannot release its pass. Wallet also exposes cancel/release for eligible unpaid reservations and an explicit continue-operation page that restores only the original server-frozen request; opening that page does not send or redeem a gift. Closing a drawer does not automatically redeem or send a gift.

Gifts use `beat_gifts`, its recipient guards, claim tokens/contexts, encrypted mail queue, resend, and the existing claim route/RPC. Market gifts add a pass reference to the same order item and gift record. Beat/discount gifts transfer the owned entitlement upon verified recipient assignment/claim; email gifts stay reserved until claim. Studio gifts activate +30 days for the verified RG Artist or begin at safe email claim. Studio uses the existing source-keyed atomic grant: `max(now, current access until) + 30 days`. Normal beat gifting and legacy Beat Pass redemption still use their existing license path. No Market action writes Score records.

## Season and earning activation

Version 2 keeps existing Score rules and Premium days. Top three receive 20% each; #4–#23 split the remaining 40% with weights `24-rank` (sum 210). Integer allocation uses largest remainders; with fewer eligible places, unassigned shares remain in the pool. Real pools are dynamic; 50,000 RG is not a fixed funding value. Active/finalized seasons retain their original version; future scheduled seasons and new season configuration select version 2.

Verified published tracks award 200 RG. Supported verified view milestones award 100 / 200 / 300 / 200 RG at 1k / 5k / 10k / 25k. Total direct earning is capped at 1,000 per account per season under the wallet lock. Every earning credit must use its verified event's canonical identity and idempotency key; changing the key cannot credit the same evidence again. Targets are 200–600 normal and 600–1,000 strong verified activity. No click, spending, gifting, purchase, holding or sponsor activity enters the collector. Score evidence is read, never augmented by RG awards. Earning/finalization switches remain false until issuance, pool, outstanding and liability budgets are explicitly configured.

## Production order

1. Run `supabase/preflight/20261010000000_rg_market_v1.sql` read-only against the actual Production SQL catalog. Review aggregate chronology/provenance checks, baseline functions/constraints, current MP3 prices/overrides and existing pass counts. A failed check blocks migration; do not rewrite or approve historical provenance implicitly.
2. Rehearse a sanitized Production schema/data copy in an isolated database, including concurrent spend, legacy pass redemption, gift resend/claim and Stripe test-mode remaining-payment/webhook recovery. Preserve a backup and existing pass-ID/count comparison. The local fixture validates repository migration compatibility, not uninspected Production drift.
3. After compatibility and operator approval, apply `20261010000000_rg_market_v1.sql`, then `20261010000001_rg_market_gift_v1.sql`, then `20261010000002_rg_season_economy_v2.sql`. Reload the Supabase REST schema cache. New tickets and issuance stay disabled. Deploy code only after the new schema is available.
4. Run `supabase/verify/20261010000000_rg_market_v1.sql`; compare all legacy pass IDs/statuses and the approved account's wallet/API against spendable ledger allocations. Do not send or redeem the real test account's pass.
5. Verify routes/UI with isolated controlled test credits and a test mail provider/Stripe test mode. Gift V1's existing server/public gift flags and encrypted email configuration must be present.
6. Activate only approved catalog rows plus `market_v1_enabled` in an explicit rollout action after checks pass. Public purchased RG utility stays unavailable. Configure actual approved budget values before enabling direct earning or season finalization; never substitute the 50k reference for a budget. Check the first future season is version 2.

Before migration, the new application intentionally fails closed on new wallet schemas. A Git push that triggers automatic deployment must wait for the coordinated migration-first rollout.

## Reproducible isolated tests

Use PostgreSQL 16 in a disposable `/private/tmp/rgodbeat-*` cluster, TCP disabled, with `PGDATABASE=rgodbeat_validation`, an explicit Unix `PGHOST`, `PGPORT`, and local `PGUSER`. Never use `.env.local` or a Supabase database connection for these fixtures.

```sh
psql -X -v ON_ERROR_STOP=1 -f tests/rg-economy-postgres-bootstrap.sql
psql -X -v ON_ERROR_STOP=1 -f tests/rg-economy-postgres.sql
psql -X -v ON_ERROR_STOP=1 -f tests/rg-economy-earning-season-postgres.sql
node tests/rg-economy-concurrency-postgres.mjs
psql -X -v ON_ERROR_STOP=1 -f tests/commerce-gift-postgres.sql
node tests/commerce-concurrency-postgres.mjs
RG_TEST_PGLITE_MODULE=/private/tmp/rgodbeat-economy-pglite/node_modules/@electric-sql/pglite/dist/index.js node --import tsx --test tests/*.test.mjs tests/rg-phase2.test.ts
npx tsc --noEmit
npx eslint .
npm run build
git diff --check
```

The baseline fixture intentionally excludes Supabase storage provisioning; commerce/identity/Score/economy/Gift/Beat-Pass migrations run in full. Mocked route/Stripe/mail tests and actual local PostgreSQL checks are not classified as live Production transactions.

Validation: 162 application tests, TypeScript, the production build, PostgreSQL 16 transaction/concurrency suites and ESLint on modified code passed. Repository-wide ESLint still reports 160 errors and 146 warnings in unmodified files. Actual Production compatibility and live Stripe/mail-provider checks remain pending.

## Files modified

- `app/api/checkout/rg-beat-pass/route.ts`
- `app/api/checkout/rg-market/cancel/route.ts`
- `app/api/checkout/rg-market/resume/route.ts`
- `app/api/checkout/rg-market/route.ts`
- `app/api/cron/rg-ecosystem/route.ts`
- `app/api/gifts/[giftId]/resend/route.ts`
- `app/api/gifts/claim/route.ts`
- `app/api/rg/market/pass/route.ts`
- `app/gifts/claim/GiftClaimClient.tsx`
- `app/rg/wallet/checkout/page.tsx`
- `app/rg/wallet/page.tsx`
- `components/cart/CartDrawer.tsx`
- `components/ranking/RgBalance.tsx`
- `components/ranking/RgProductParts.tsx`
- `components/ranking/RgSeasonRankingClient.tsx`
- `components/rg/RgMarketClient.tsx`
- `components/rg/RgMyPasses.tsx`
- `components/rg/RgPassActions.tsx`
- `components/rg/RgPassResume.tsx`
- `docs/rg-economy-v1-rollout.md`
- `lib/commerce/email.ts`
- `lib/commerce/fulfillment.ts`
- `lib/commerce/gift-fulfillment.ts`
- `lib/commerce/gift-recipient.ts`
- `lib/commerce/market-utility.ts`
- `lib/rg/phase2/direct-earning.ts`
- `lib/rg/product/catalog.ts`
- `lib/rg/product/chart.ts`
- `lib/rg/product/types.ts`
- `lib/rg/product/wallet-client.ts`
- `lib/rg/product/wallet.ts`
- `supabase/migrations/20261010000000_rg_market_v1.sql`
- `supabase/migrations/20261010000001_rg_market_gift_v1.sql`
- `supabase/migrations/20261010000002_rg_season_economy_v2.sql`
- `supabase/preflight/20261010000000_rg_market_v1.sql`
- `supabase/verify/20261010000000_rg_market_v1.sql`
- `tests/commerce-fulfillment.test.mjs`
- `tests/helpers/rg-market-fixtures.mjs`
- `tests/rg-beat-pass-checkout.test.mjs`
- `tests/rg-economy-concurrency-postgres.mjs`
- `tests/rg-economy-earning-season-postgres.sql`
- `tests/rg-economy-postgres-bootstrap.sql`
- `tests/rg-economy-postgres.sql`
- `tests/rg-market-gift-fulfillment.test.mjs`
- `tests/rg-market-v1.test.mjs`
- `tests/rg-phase2-routes.test.mjs`
- `tests/rg-phase3.test.mjs`
- `tests/rg-wallet-visibility.test.mjs`
