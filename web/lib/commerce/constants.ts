// Plain money constants with zero imports, so client components (like the
// withdraw and wallet pages) can use them directly without pulling in
// lib/commerce/ledger.ts's server-only Prisma dependency into the browser
// bundle.

// Explicit ask: lowest amount a creator can withdraw in one payout, shown
// on the withdraw page and enforced by POST /api/wallet/withdraw. Not a
// Bachs-imposed limit (their docs don't state one) — a business rule of
// this app's own.
export const MINIMUM_WITHDRAWAL_KOBO = 100_000; // ₦1,000

// DECISIONS.md: 12% commission (was 15% at launch, updated 2026-08-31), fee
// absorbed by the platform (not passed to the artist as a separate
// withdrawal fee). Lives here, not in lib/commerce/ledger.ts, specifically
// so the wallet page (a client component) can quote this same number in its
// own copy — "your total is after our 12% fee" — without duplicating a
// literal that would silently drift from the real rate the next time it
// changes. ledger.ts re-exports this as COMMISSION_RATE so every existing
// server-side import of it there keeps working unchanged.
export const COMMISSION_RATE = 0.12;
