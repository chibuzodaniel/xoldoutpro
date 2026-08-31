// Plain money constants with zero imports, so client components (like the
// withdraw page) can use them directly without pulling in lib/commerce/ledger.ts's
// server-only Prisma dependency into the browser bundle.

// Explicit ask: lowest amount a creator can withdraw in one payout, shown
// on the withdraw page and enforced by POST /api/wallet/withdraw. Not a
// Bachs-imposed limit (their docs don't state one) — a business rule of
// this app's own.
export const MINIMUM_WITHDRAWAL_KOBO = 100_000; // ₦1,000
