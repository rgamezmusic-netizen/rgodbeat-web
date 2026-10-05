# Phase 2 closure verification — 2026-10-05

## Evidence and limitations

Production was inspected through read-only Supabase OpenAPI/REST and Auth Admin APIs using the existing configured service credentials. Project: `wrcdapajrsuqgpbfadff.supabase.co`. No secrets or personal records are stored here.

- Existing public production tables and field types were checked through OpenAPI. `customers.studio_access_until` is a nullable timestamp with time zone. The auth schema is not exposed there: its exact column types require SQL catalog verification. The original preflight incorrectly required `auth.users.email` to be exactly `text`; the corrected query accepts compatible `text`/`varchar`, reports actual catalog types, and separately checks email SELECT access. A missing or incompatible email still blocks rollout because Premium finalization uses it to bridge the existing customer entitlement; RG ownership remains UUID-based.
- Phase 1: one artist, two draft tracks, two primary associations, one catalog-linked track with an existing canonical beat, no RG publication links. All current track/artist/beat relationships were checked against the actual stored IDs.
- One historical uploaded YouTube job exists and remains unlinked. No publication was created or claimed.
- The Stripe API returned an enabled live webhook for `https://www.rgodbeat.com/api/webhooks/stripe`, subscribed to checkout completion. Production also contains orders, order items, and purchases. This verifies existing commerce infrastructure; it does not prove an RG payment integration.
- Stored YouTube channel ID and encrypted refresh credential exist. Local OAuth client ID, secret, redirect URI, encryption key, and `CRON_SECRET` are unavailable. The current token's scopes and an authenticated Google statistics request could not be verified. No credentials were changed.
- No Vercel project API connection is configured locally, and authenticated browser automation is unavailable in this session. Production cron registration, environment secrets, deployment protection, plan, and function time budget must be verified in Vercel before rollout.
- REST/OpenAPI does not expose PostgreSQL catalogs, all constraints, RLS, function bodies, or hidden overloads. The single SQL preflight must confirm these production metadata checks before migration. New functions use strict CREATE, so an unexpected existing function causes transaction rollback instead of being replaced. Migration history alone is not treated as proof.

## Connection classification

| Integration | Status | Evidence |
| --- | --- | --- |
| Supabase authentication and service role | VERIFIED REAL CONNECTION | Auth API 200; existing server validates `auth.getUser()` |
| Artist → draft track → canonical catalog beat | VERIFIED REAL CONNECTION | Actual production records/relationships and Phase 1 RPC metadata |
| Existing YouTube publishing | VERIFIED REAL CONNECTION for stored infrastructure; linked chain not live-tested | Confirmed legacy job and stored channel connection; existing upload route preserved |
| Existing commerce / orders / licenses | VERIFIED REAL CONNECTION | Stripe live webhook/API plus production schemas/records |
| Studio entitlement mechanism | VERIFIED REAL CONNECTION | Studio access and exporter read customer expiration; admin bypass is permanent |
| Score / seasons / separate ranking / wallet / reward pool / Premium grants | IMPLEMENTED BUT NOT YET LIVE | Actual migration/RPCs executed against isolated PostgreSQL fixtures; migration not applied |
| Google metrics collection | IMPLEMENTED BUT NOT YET LIVE; BLOCKED BY LOCAL CREDENTIALS | Actual collector tested with API fixtures; no authenticated live Google read |
| Cron | IMPLEMENTED BUT NOT YET LIVE; BLOCKED BY PRODUCTION CONFIGURATION | Actual handler tests plus compiled anonymous HTTP 401; deployed schedule/secret unverified |
| RG purchase / Buy & Boost / sponsor payment fulfillment / redemption | NOT CONNECTED | No RG fulfillment dispatch in existing Stripe handler; money switches default false |
| License scoring / achievement grants / activity Coin earning / base or activity pool issuance / reserve spending | NOT CONNECTED | No verified producer/operational RPC; scoring rules disabled where applicable; no minting route |
| ON FIRE / YouTube Analytics API | NOT CONNECTED | Data API snapshots support future velocity; no implemented velocity label or Analytics API integration |

## Real entitlement and provider contracts

`app/api/studio/access/route.ts` checks `customers.email = authenticated user.email` and expiration greater than current time. `lib/youtube/access.ts` uses the same field for exporter authorization. Null expiration is demo/expired, not lifetime. `isSiteAdmin()` independently bypasses expiration. RG finalization locks the customer and extends `max(current_expiration, now()) + reward_days`, atomically with all season rewards. Tests cover expired/null accounts, active 30/15 day extensions, far-future expiration, deleted owners, and duplicate finalization.

The pre-existing commerce helper `grantStudioAccess()` performed a separate read/update, allowing a simultaneous commerce and RG grant to overwrite an extension. It now uses the shared, service-only `rg_extend_studio_access(uuid,integer)` RPC. That RPC locks the existing customer row and extends the same entitlement. Only a missing-function response (`PGRST202`/`42883`) uses the old compatibility path before migration. Once installed, commerce grants and RG finalization use the same row lock. SQL fixtures prove additive sequential extension; simultaneous real Postgres sessions are not available in the test engine. Checkout, payments, licenses and subscription logic were not redesigned.

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. The handler rejects missing/wrong secret before creating a service client. Daily schedule is `5 0 * * *` UTC; finalization may run on the next daily invocation rather than exactly at a boundary. Scheduled snapshot writes are idempotent per season/UTC day. Finalization or metric verification failures return 503 and defer finalization. Persisted Score crossings and publication events are reconciled before freezing an unfinished season. With no linked publications, no OAuth request is attempted and the response explicitly does not claim a verified metrics connection. Vercel's production scheduling and timing cannot be proved from `vercel.json` alone.

Official contract: https://vercel.com/docs/cron-jobs/manage-cron-jobs

YouTube OAuth already requests `youtube.upload` and `youtube.readonly`. Data API `videos.list?part=statistics,snippet,status&id=...` supports view/like counts, channel identity, publishedAt and upload status; YouTube Analytics is a separate service. Only processed videos from the configured channel are accepted. Missing counts are not converted into zero. The first observation is a baseline; later crossings use persisted daily evidence and can retry within the unfinished season. Milestones are lifetime-unique per publication and threshold. No additional Analytics scope is used or claimed as granted.

Official contracts: https://developers.google.com/youtube/v3/docs/videos/list and https://developers.google.com/youtube/v3/docs/videos

## Reproducible local verification

No repository package or lockfile changes were made for the SQL runner. PGlite is a temporary, isolated PostgreSQL engine, not a connection to Supabase. PostgreSQL 18 fixture execution validates actual SQL/PLpgSQL, constraints, privileges, transactions and rollback; it does not claim to test Supabase's exact production Postgres version or concurrent sessions.

Install the test engine outside the repository:

```sh
npm install --prefix /private/tmp/rg-phase2-verification --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.5.8
```

Run from the project root:

```sh
node --import tsx --test tests/rg-phase2.test.ts
node --test tests/rg-phase2-routes.test.mjs
RG_TEST_PGLITE_MODULE=/private/tmp/rg-phase2-verification/node_modules/@electric-sql/pglite/dist/index.js node --test tests/rg-phase2-sql.test.mjs
npx tsc --noEmit
npx eslint lib/commerce/fulfillment.ts --rule '@typescript-eslint/no-explicit-any: off'
npx eslint lib/rg/phase2 app/api/cron/rg-ecosystem app/api/rg/wallet app/api/rg/rankings app/api/admin/rg/youtube-metrics lib/rg/publications.ts components/ranking/RgSeasonRankingClient.tsx app/ranking/season/page.tsx tests/rg-phase2* tests/helpers/rg-fixtures.mjs
npm run build
git diff --check
```

SQL fixtures use the public production-verified dependency field shapes, a compatible `varchar(255)` auth email fixture (not a claim about its production type), Phase 1 migration, actual existing job-reservation function, and the full Phase 2 migration. They are disposable records in memory. The legacy commerce file has seven existing explicit-any lint errors and four existing unused-variable warnings; comparison against HEAD proves the helper change adds no diagnostics. Its targeted lint uses a command-only explicit-any override. Project lint configuration was not changed.

Source-level route tests replace external services explicitly; those mocks are not classified as live integrations.

Final automated suites: 13 deterministic engine tests, 12 source/route tests, and 17 actual PostgreSQL/RPC tests passed (42 total), including email catalog type/access regression checks and RLS/client-permission checks on all 14 Phase 2 tables. RLS activation uses explicit ALTER TABLE statements rather than dynamic SQL. TypeScript, RG targeted ESLint, production build and diff checks passed; only the documented existing commerce lint diagnostics and existing middleware/cookies build messages remain.

Compiled localhost HTTP checks additionally confirmed: cron 401, wallet 401, Artist 401, Track 401, admin metrics 403, and legacy Studio publish 401 when anonymous. The temporary server was stopped. No authorized cron was invoked against production.

## Safety state and next action

New migration creates 14 Phase 2 tables, two views, and ten functions. Trusted timestamp functions pin UTC, including during DST transitions. It touches existing customer data only when an authorized future season finalization grants Premium, not during migration. Existing table definitions and policies, public ranking, Studio, auth, publishing, The Park, R2 and environment files remain unchanged. Commerce has only the atomic entitlement helper change described above.

Purchases, redemption and sponsor payment fulfillment default OFF. Minting, outstanding supply and pool caps default zero. Configurable simulator separates new issuance from already purchased/contributed RG and rejects unfunded pool assumptions. Pool contributions create zero Score. Sponsor fixtures establish trusted audit records explicitly; they are not real payment confirmations. Reserve allocation is tested; a reserve-spending operation is not implemented.

**LOCAL COMMIT CHECKPOINT RECOMMENDED — DO NOT PUSH YET.** Create a separate closure commit in GitHub Desktop; keep the existing Phase 2 checkpoint as a recovery point. Suggested message: `fix(rg): verify Phase 2 integrations and harden accounting retries`.

Then run only `supabase/preflight/20261006000000_rg_score_economy_preflight.sql` in the configured Supabase SQL Editor. Paste the entire read-only file; every `ready` must be TRUE. Return the results before any migration. The migration remains unapplied; production remains unchanged. Verify Vercel's production secret/cron/function settings and the existing YouTube OAuth configuration before a future authorized deployment. Do not enable RG payment or redemption switches; provider fulfillment is not connected.

## Closure files

Modified:

- `app/api/cron/rg-ecosystem/route.ts`
- `app/api/rg/wallet/route.ts`
- `lib/commerce/fulfillment.ts` (only shared entitlement RPC with compatibility fallback)
- `lib/rg/phase2/database.ts`
- `lib/rg/phase2/engine.ts`
- `lib/rg/phase2/rankings.ts`
- `lib/rg/phase2/youtube.ts`
- `supabase/migrations/20261006000000_rg_score_economy.sql`
- `tests/rg-phase2.test.ts`

Created:

- `docs/rg-phase2-verification.md`
- `lib/rg/phase2/publication-scores.ts`
- `lib/rg/phase2/youtube-metrics.ts`
- `supabase/preflight/20261006000000_rg_score_economy_preflight.sql`
- `tests/helpers/rg-fixtures.mjs`
- `tests/rg-phase2-routes.test.mjs`
- `tests/rg-phase2-sql.test.mjs`
