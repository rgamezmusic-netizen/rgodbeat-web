# Commerce security and gifting foundation

This implementation prepares the existing checkout and the private data model. It does not add gift checkout UI, send email, or enable RG purchases/redemption.

## Purchase and identity

- Beat checkout writes an immutable server-priced snapshot before creating Stripe Checkout. Session metadata carries only the opaque intent UUID; verified Stripe `amount_total`, `currency`, `payment_status`, and the saved snapshot must agree before fulfillment.
- The payer remains `orders.customer_id`. A normal beat purchase assigns `purchases.customer_id` to the payer. Gift data reserves recipient and future claim state separately; no gift checkout is currently exposed.
- `customers.auth_user_id` is a private nullable bridge. The migration backfills only unique verified-email matches and preserves all commercial customer IDs and guest history. Signup no longer inserts a commercial customer using the Auth UUID. Verified account access resolves through a server-only RPC.
- Purchase, license, contract, ticket, and stem access require a paid, completed, active entitlement owned by the authenticated mapped customer or possession of a 256-bit order-scoped guest token. The database stores only SHA-256 hashes. The guest token is returned as an HttpOnly cookie by verified checkout completion and expires after 90 days.

## Fulfillment and reversals

- The webhook validates Stripe signatures and paid status, claims a persistent event lease, and returns a failure to Stripe if mandatory work fails. The lease token prevents an old worker from completing a newer retry.
- Order lines/purchases use unique commercial keys. License IDs are allocated from a database sequence. The order stays in `processing` until its purchases, exclusive reservation, idempotent Studio extension, and intent completion have succeeded. Retries repair rows already created.
- Exclusive inventory has one row per beat. A verified self checkout reserves the row before the order becomes downloadable; a competing paid attempt fails closed and its entitlement is revoked.
- A full refund revokes a whole order transactionally. A dispute revokes entitlements and claims while it is reviewed; a dispute win does not automatically restore access. A partial refund is recorded for manual review because Stripe line refund data is not reliably mapped to one line item here.
- Each normal beat order and each gift checkout source receives at most one 30-day Studio extension. The row-locked grant extends an existing active expiration. Gift claims key the grant to the checkout intent so multi-item gifts cannot multiply the bonus. No code in this foundation writes RG Score.

## Gift preparation

`commerce_checkout_intents` stores frozen recipient mode and purchased facts. `beat_gifts` is one paid item/recipient/claim record per `order_item`. An intent has one recipient, enforced when gift rows are inserted. Email gifts have no `purchases` row until the recipient claim RPC atomically verifies the Auth account's verified email, paid order, unrevoked one-use hash, recipient customer bridge, and exclusive hold. Tokens are designed to be replaceable without deleting the paid gift.

The claim RPC is service-only and performs no GET-side mutation. No route currently issues claim tokens, creates pending gift rows on verified payment, or generates post-claim contracts, so the gift path cannot be activated until those server handlers and UI exist and are tested. Public RG Artist search must later return only stage name/slug and resolve an eligible account on the server.

Transactional email uses a provider interface plus an idempotent private queue. A gift claim link must be encrypted with AES-256-GCM before queueing; the key name is `RG_TRANSACTIONAL_EMAIL_ENCRYPTION_KEY` and requires a 32-byte base64 value. No such key or transactional provider is configured here, and no email is sent. Supabase Auth confirmation email is separate from transactional delivery; production gift email needs a dedicated transactional sender and retry worker.

## Refund scope and activation gates

The currently configured live Stripe webhook does not subscribe to refund/dispute events. The code handles full `charge.refunded` and `charge.dispute.created`, but an operator must configure these events before gift activation. Partial refunds stay manual.

The migration was exercised locally on PostgreSQL 16 in a temporary `/private/tmp` cluster. The harness supplied Supabase-compatible `auth`/`storage` schemas and roles, ran the repository migrations, seeded a synthetic historical guest purchase, removed `purchases.license_id` and `purchases.contract_version`, then ran preflight, the target migration, and post-migration verification. The order, purchase, and customer IDs and ownership remained unchanged; the missing license fields were populated. A database claim transaction assigned the gift purchase and 30-day Studio extension to the verified recipient, not the payer. Two concurrent Studio-grant calls produced one grant and the same expiry. Two concurrent Stripe-event claims initially revealed a deadlock from a redundant unique constraint; that constraint was removed and the race then left exactly one active lease without a deadlock.

These checks validate the repository schema in an isolated PostgreSQL environment, not the current Production schema. The migration remains unapplied. No Stripe test credentials were used. Gift checkout creation, safe artist search, paid gift fulfillment/token issuance, claim API/page, and gift buyer status UI are not implemented, so gifting is not ready to activate. No transactional email provider is configured and no email was sent.
