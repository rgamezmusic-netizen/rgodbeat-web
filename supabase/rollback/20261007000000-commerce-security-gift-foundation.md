# Commerce foundation migration recovery

The migration is additive and runs in one PostgreSQL transaction. If any DDL, backfill, unique-index build, or RPC creation fails before `COMMIT`, PostgreSQL rolls back the entire migration. Do not manually continue a partially applied version.

Before a future production application, retain the read-only output of the matching preflight and a database backup. After commit, do not run a destructive `down` migration: the new license identifiers, customer/Auth links, paid gift state, guest access hashes, Stripe event evidence, and Studio grant ledger may already be in use.

If application verification fails after commit:

1. Stop rollout of the new application and restore the prior application release if required. Do not alter Stripe or production from this repository task.
2. Preserve all new tables and evidence rows. Restore the previous application only if it tolerates the additive columns and private-table grants.
3. If revoking direct access to `customers`, `orders`, `order_items`, or `purchases` breaks a confirmed consumer, inspect that consumer and give it a narrowly scoped server API. Do not restore public access to customer/Auth mappings or purchase assets.
4. Repair a failed license backfill only from the stored purchase/order evidence and regenerate contracts after reviewing ownership. Never reset the sequence below the maximum persisted suffix.
5. If checkout events are stuck, inspect `stripe_event_processing` and the verified Stripe event before retrying. Never mark an order complete by hand to clear a retry.
6. Resolve full refunds and disputes against the Stripe charge and order. Partial refunds remain a manual item-mapping decision; do not revoke an arbitrary line item.

This file is recovery guidance, not a down migration. The migration has not been applied.
