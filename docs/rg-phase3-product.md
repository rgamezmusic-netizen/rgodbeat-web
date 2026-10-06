# RG public product — Phase 3

Estado real actualizado el 6 de octubre: la temporada 1 responde activa en la
base y API pública. Los cambios de presentación y el alcance pendiente de pagos
se detallan en [rg-season1-activation.md](rg-season1-activation.md). Las notas de
activación inicial que siguen no sustituyen esa comprobación más reciente.

## Release boundary

Local navigation activation only. No migration, payment activation, checkout, production fixture,
manual season finalization, YouTube upload, push or deployment is part of this change.
The activation checkpoint routes the homepage and desktop/mobile TOP 23 menu links
to `/ranking/season` through `RG_CHART_PATH`. The existing `/ranking` engine remains
intact as the legacy fallback, including beat-voting/comment deep links. Moving the
new chart to `/ranking` and removing the legacy engine require real scoring activity
and a separately approved release. The Studio entry CTA remains visible even when
the chart has few entries. This checkpoint is local; no push or deployment is made.

## Real surfaces

- `/ranking/season`: server-loaded authoritative Phase 2 ranking DTO, immediate
  Tracks / Artists / Beats tabs, controlled-snapshot movement, server-clock-based
  countdown, optional explicit refresh (no ranking polling), actual pool and prizes.
- `/rg/artists/[slug]`: active canonical artist, current-season performance,
  up to 24 published primary tracks, artist placements from the last six finalized
  seasons. Drafts, owners, email, private wallet and audit records are excluded.
- `/rg/tracks/[id]`: published track + active primary artist + canonical published
  catalog beat when present. YouTube link only when an existing live export job is
  uploaded, privacy `public`, and video ID matches the verified publication link.
  Private, unlisted and orphaned-job links are hidden. Latest recorded public
  performance observations and earned milestone count are shown only if present.
- `/rg/beats/[slug]`: published catalog identity, season performance, Top 23 tracks
  using that canonical UUID, direct existing catalog/listening/licensing route.
  The count is explicitly tracks *in Top 23*, never all usage or lifetime popularity.
- `/rg/wallet`: validated authenticated session only; ledger-derived balance.
  No buying, redemption, transfers, speculation or cash actions. Anonymous users
  are redirected to the existing login. `/api/rg/wallet` shares this read module
  and retains 401 / private no-store / unavailable-error semantics.
- The chart member section shows only the current session owner's balance/profile.
  It never puts a balance in a public ranking/profile DTO. Personalized pages are
  force-dynamic; the anonymous public Phase 2 ranking API contract is unchanged.

## Product claims

All three charts consume `rg_current_rank_totals`; no manual counters or client
score calculation. Unranked entity profiles sum only their season `score_points`
from the same server-side ledger in bounded pages. Ledger rows never reach the
browser. Zero is an intentional starting state; read failures are not shown as zero.

Top 3 Premium / pool shares are explicitly **Artist** rewards and are read from
that season's real immutable `reward_distribution`. Track/Beat podium styling is
competitive emphasis, not a promise of separate payouts. No future reward amount
is fabricated. Pool zero displays “0 RG”. Sponsors appear only through
Phase 2's active sponsor + active in-date sponsorship filters. HTTPS links only;
logos render only for paths accepted by the existing public storage helper. No new
sponsor upload/storage infrastructure is implied. Unknown logo paths show names.

Publishing and server-verified performance currently generate Score; final Top 3
artist placement grants available RG and Premium. There is no connected ordinary
activity-to-RG minting, purchase fulfillment, redemption, community/commerce/
achievement Score producer or sponsor checkout. None is presented as active.
Artist history and track milestone contracts form the progression foundation;
unsupported achievements remain hidden.

## ON FIRE — conservative proposal, NOT enabled

Public DTOs explicitly set `onFire: false`; no badge is displayed. A future versioned
server rule could require at least five consecutive daily verified observations,
no count decreases, at least 1,000 new views in the last 48 hours, and growth at
least three times the preceding 48 hours (which must have a positive baseline).
Never use lifetime views alone, browser counts or an initial observation as growth.
This proposal requires deterministic evidence/edge-case tests and a separately
approved activation. This release does not modify metrics, scoring or rules.

## First real entry

The existing path remains: authenticated owner → canonical artist → primary track
→ stored catalog beat UUID (or null for external beat) → confirmed uploaded export
job → `record_rg_publication_link` → `rg_record_score_event(TRACK_PUBLISHED)` →
one ledger → Track / Artist / canonical Beat rankings. Publication success is
independent of Score sidecar errors; existing cron reconciliation retries verified
links. Phase 2 SQL/route suites prove ownership, canonical beat, once-per-track
idempotency, nullable beat behavior and all three aggregations locally.

Read-only production checks during Phase 3 found zero linked RG publications,
score events, coin entries and sponsors. Therefore a first real chart entry cannot
be demonstrated live yet. Do not seed production or upload a verification video.
The first genuine linked Studio publication will provide the missing live evidence.

## Verification

- `npx tsc --noEmit`
- Targeted ESLint on new product modules/components/routes and touched tests.
- `npm run build`
- `node --import tsx --test tests/rg-phase2.test.ts tests/rg-phase2-routes.test.mjs tests/rg-phase3.test.mjs`
- `RG_TEST_PGLITE_MODULE=/path/to/pglite/dist/index.js node --test tests/rg-phase2-sql.test.mjs`
- `git diff --check`

Browser smoke uses an external temporary Playwright installation and the existing
Chrome; no project dependency changes. Run a local production build on port 3103:

```
RG_TEST_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
RG_TEST_TOP23_ACTIVATED=1 \
RG_TEST_ARTIST_SLUG=existing-artist-slug \
RG_TEST_BEAT_SLUG=existing-beat-slug \
RG_TEST_DRAFT_TRACK_ID=existing-draft-uuid \
node tests/rg-phase3-browser.mjs
```

With `RG_TEST_TOP23_ACTIVATED=1`, the suite also clicks the homepage and desktop/mobile
TOP 23 links, checks the Studio entry CTA, and confirms the legacy ranking, catalog
and Studio routes remain available. Omit this test flag when checking a deployment
that precedes navigation activation; it is not a production environment variable.

The browser suite checks 360px / 390px / 1280px chart rendering, immediate tabs,
no ranking requests/polling, no horizontal overflow or hydration/runtime errors,
anonymous wallet protection, profile 404s and optionally real artist/catalog/draft
privacy. It intentionally expects the current zero-activity season; adapt that
expectation before running once genuine activity or sponsors exist. Screenshot
artifacts live outside the repository. Fixture identities exist only in local tests.
