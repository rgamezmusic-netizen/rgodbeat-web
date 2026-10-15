This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Studio vocal deliveries

`Exportar → Enviar voces a RGODBEAT` sends selected RAW vocal tracks to the private admin inbox at `/admin/studio-deliveries`. It records the current project BPM, key, scale, rendered duration, account email, artist, song title, message and per-track tuning settings. All WAVs begin at zero. This flow is separate from purchased beat stem requests.

Storage uses the existing `CLOUDFLARE_R2_*` credentials and bucket. Keep this bucket private: do not enable public `r2.dev` access or attach a public custom domain. Delivery manifests, staging and final WAVs use `studio/deliveries/`; completed inbox entries use `studio/delivery-inbox/`. Existing project cleanup does not traverse these prefixes. No database migration is required.

Each WAV is 32-bit float at its recording rate, with a 128 MB limit per track, eight tracks and 768 MB per delivery. New delivery intents are limited to ten per account per UTC day. Authenticated users need an active Studio pass; site administrators retain access. Upload requests contain at most 2 MB. The server assembles R2 multipart segments in 6 MB groups, validates the WAV header and SHA-256, and confirms every file before recording receipt. Retries preserve the delivery ID and metadata while the export dialog remains open; a browser reload requires preparing a new delivery. Incomplete staging data is retained; there is no automatic deletion of artists' deliveries.

Email configuration (server variables only):

- `RESEND_API_KEY` and `RESEND_FROM_EMAIL`: the existing Resend configuration, using the authorized sender `RGodbeat Gifts <gifts@mail.rgodbeat.com>` so the visible sender name is RGodbeat Gifts.
- `RG_STUDIO_DELIVERY_EMAIL`: optional recipient override; defaults to the requested `rgodbeat@gmail.com`.
- `NEXT_PUBLIC_SITE_URL`: optional canonical site origin; defaults to `https://rgodbeat.com` for admin links.
- `CRON_SECRET`: protects the daily `/api/cron/studio-deliveries` mail retry worker registered in `vercel.json`.

The email contains a private admin-page link, not audio attachments or a public sharing link. Missing configuration or provider failure leaves the delivery received with a pending email; the admin can retry and the daily worker retries up to ten pending notifications per run. The worker and interactive requests share a conditional R2 mail lease. WAV downloads require admin authorization and use signed URLs lasting 60 seconds. The admin can also download human-readable TXT and JSON project metadata.

Validation:

```bash
node --test tests/studio-deliveries.test.mjs
npm run build
# Live transport verification: uploads only synthetic audio to an isolated prefix,
# sends no email, creates no inbox receipt, and removes its own test objects.
STUDIO_DELIVERIES_LIVE_TEST=true node --env-file=.env.local scripts/test-studio-deliveries-r2-live.mjs
```

The opt-in `scripts/test-studio-delivery-production.mjs` verifies a real synthetic WAV delivery and email using the deployment's existing environment. It requires an explicit, unique `STUDIO_DELIVERY_PRODUCTION_TEST_ID`, keeps a clearly marked technical receipt, and sends only to the authorized RGODBEAT recipient. It is not part of the normal build or Git push workflow. Reusing the same ID reuses the receipt and avoids another email. Production verification on 2026-10-15 passed and the recipient confirmed receipt.

The Vercel project `rgodbeat-web` is connected to `rgamezmusic-netizen/rgodbeat-web`, production branch `main`. Save changes, commit them and push `main` to publish subsequent updates. The vocal delivery release was also deployed directly from the working tree as `dpl_2vP1kLsUYfgDTf9FZi9Rc1JnwoCv` and promoted to `www.rgodbeat.com`.
