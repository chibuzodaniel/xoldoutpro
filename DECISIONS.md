# DECISIONS.md

Every assumption made building XOLDOUT, what was chosen, and why. One entry per decision. Source of truth for scope is `xoldout-prd.md`.

## Blocking decisions (answered 2026-08-14, via AskUserQuestion)

- **Platform commission**: 15%, withdrawal fee absorbed by the platform. Shapes `WalletLedgerEntry.kind = COMMISSION_FEE` and `Payout.feeKobo` (currently always 0).
- **Settlement / refund window**: 7-day pending → available, 7-day refund window. One window serves both (PRD explicitly allows this).
- **Payment processor**: Flutterwave — card, bank transfer, and USSD. Chosen over Paystack per explicit user preference; no functional reason to prefer one over the other for this build.
- **Sold-out semantics**: cap is per release; a sold-out release stays permanently sold out; a second pressing must be a brand-new listing (new `Product` row), never a reopened cap on the old one.
- **Auth**: Firebase Auth — email/password and Google sign-in. Session verified server-side via Firebase Admin `verifyIdToken`; the Postgres `User` row is mirrored on first sign-in via `firebaseUid`, created by `POST /api/auth/sync`.
- **Stack/hosting**: Next.js (App Router) + Postgres (Prisma) + Cloudflare R2, Vercel/Railway-class hosting.

## Migration history is out of sync with the schema (2026-08-14)

- `npx prisma dev`'s shadow database (used to diff migrations before writing a new one) is persistently broken — every `migrate dev` attempt after the initial one fails with `type "LedgerKind" already exists`, even immediately after a clean `db push`. Unlike the connection-pool crashes elsewhere in this file, this one isn't intermittent — it reproduces every time.
- **The `User.socialLinks`/`User.pushEnabled` columns (added for the Settings redesign) were applied via `npx prisma db push`, not `migrate dev`** — so there is no corresponding file in `prisma/migrations/`. `prisma/schema.prisma` is the accurate source of truth for the current schema; the migrations folder is one change behind it.
- **Before deploying anywhere with `prisma migrate deploy`** (which only replays files in `prisma/migrations/`, never the schema directly), someone needs to either: (a) run `prisma migrate dev` once against a real, non-`prisma-dev` Postgres to generate a baseline migration matching current `schema.prisma`, or (b) hand-write the missing migration SQL (`ALTER TABLE "User" ADD COLUMN "socialLinks" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "pushEnabled" BOOLEAN NOT NULL DEFAULT false;`) and mark it applied with `prisma migrate resolve --applied`. Do this before the next `migrate dev` call, not after — otherwise the drift compounds.

## Naming override (2026-08-14)

- **The MVP tab labeled "Fanbase" in the PRD is called "Socials" in the app** (`/socials`, was `/fanbase`), per explicit user instruction. Note this collides with the PRD's own Phase 3 vocabulary, where "Socials" names a *different*, not-yet-built feature (a public algorithmic feed, distinct from the private following-based announcements this tab actually shows — PRD §5/§11). If/when Phase 3 Socials gets built, the naming will need to be reconciled — either this tab gets renamed again or the P3 feature gets a different name.

## Mid-build change (2026-08-14)

- **Firebase scope narrowed to Auth + push (FCM) only.** Originally proposed Auth.js with Credentials+Google; user redirected mid-build to Firebase Auth specifically, plus Firebase Cloud Messaging for push notifications. Postgres/Prisma remained the system of record for everything else (money, stock, entitlements) — nothing in the approved architecture/schema plan changed except the auth provider. `User.fcmTokens` added to receive push later; no push-sending code exists yet (nothing in Milestone 1/2 requires it — revisit when Fanbase announcements or purchase confirmations are built).

## Should-know defaults (PRD §20 — no objection raised, proceeding with recommended default)

- Money stored as integer **kobo**, never floats (`priceKobo`, `amountKobo`, etc. throughout).
- Free releases **may** carry a quantity cap (`priceKobo = 0` and `StockPolicy.cap` are independent).
- Default preview length when a track is ≥30s: **30s**. Shorter tracks default to a custom length capped at their own duration.
- Pricing is **per release only** in MVP — no per-track pricing within an EP/album.
- Upload limits: audio ≤ **200MB** per file, ≤ **30 tracks** per release.
- Repo root is `xoldOutpro/` (this directory); PRD files stay here, app code lives in `web/`.
- No Figma/brand file was provided — UI built from the design tokens and screen reference in `xoldout-prd.html` (dark theme, serif display type, `#E11D2E` accent).
- No staging environment yet — local (`prisma dev`) + production only.

## Implementation notes / scope calls made while building Milestone 1

- **Local Postgres**: `npx prisma dev` (Prisma's bundled local Postgres, no Docker) rather than a hosted instance, since this is local development. Swap `DATABASE_URL` for a real Postgres connection string before deploying.
- **Waveform peaks + streaming transcode run synchronously** inside `POST /api/uploads/audio/ingest` (ffmpeg via `ffmpeg-static`) rather than through the `Job`/worker-queue design in the architecture plan. The `Job` table still exists in the schema for the future move to async processing under load (large catalogs, slow uploads) — for Milestone 1's scale, synchronous is simpler to develop and test end-to-end without standing up a second always-on process. `STOCK_SWEEP`/`SETTLEMENT_SWEEP` jobs (releasing expired stock holds, flipping pending ledger entries to available) are Milestone 2 work and still need the queue — that's when the worker actually needs to exist.
- **Streaming audio rendition is MP3** (`libmp3lame`, 128kbps), not AAC or Opus/WebM — chosen because MP3 needs no seek table/container (streams fine from a plain byte pipe) and plays on every browser including iOS Safari, which WebM/Opus does not reliably support.
- **Avatar/cover are single server-resized derivatives**, not a multi-size ladder — avatar 512×512, cover 1200×400. Release artwork *does* get a real ladder (64/256/1024) since it's shown at genuinely different sizes across Home/catalog/detail surfaces and the PRD calls this out explicitly (§7.1); profile images are shown at one size in practice, so a ladder there would be unused complexity.
- **Release cap editing**: only lowering an already-set cap is supported (down to units sold, matching the PRD's 500→100-not-50 example). Introducing a cap on a previously-uncapped release, or removing a cap entirely, is rejected — both would let scarcity be gamed after the fact, which the PRD doesn't sanction and the "cannot raise" rule implies.
- **`npx prisma dev`'s embedded Postgres is fragile under concurrent load, even with the tuned pool params below.** It repeatedly crashed outright (not just throttled) during this build whenever several separate Node processes hit it around the same time — the stock-race test's own concurrent connections, `next build`'s static-generation workers, and a lingering `next dev` instance were each enough on their own to kill it. `npx prisma dev ls` kept reporting "running" after each crash; the only reliable fix was `npx prisma dev stop <name>` then `start <name> -d` and re-verifying with `prisma db execute` before doing anything else. If this keeps happening on your machine, swap in a real local Postgres (Docker, or a free-tier hosted instance) — the embedded dev server is convenient but not built for this kind of concurrency testing.
- **Local Postgres connection string needs explicit pool params.** `npx prisma dev`'s embedded Postgres recommends (and effectively requires) `connection_limit=10&connect_timeout=0&max_idle_connection_lifetime=0&pool_timeout=0&socket_timeout=0` on `DATABASE_URL` — without them, a burst of ~10+ concurrent connections (exactly what the stock-race test does) killed the local dev server outright rather than queuing. `lib/db.ts` also caps the `pg.Pool` at `max: 10` to match. This is a local-dev-only concern; a hosted Postgres in production can use its own pool sizing.
- **Release detail page (`/r/[id]`) ships in Milestone 1 as browse-only** — artwork, price, remaining/sold count, tracklist, no player and no buy button yet. Buying, entitlements, and playback are explicitly Milestone 2 (PRD §19); building a real player against non-existent entitlements would need to be redone anyway.
