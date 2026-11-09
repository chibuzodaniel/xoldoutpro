// Catalog subscriptions (v2, design/v2-prototype, 2026-11-09) — shared
// constants and pure helpers (safe to import from client components).

export const SUBSCRIPTION_DURATIONS = [
  { days: 30, label: "Monthly" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "Yearly" },
] as const;

export type SubscriptionDurationDays = (typeof SUBSCRIPTION_DURATIONS)[number]["days"];

export const SUBSCRIPTION_DAYS = SUBSCRIPTION_DURATIONS.map((d) => d.days) as number[];

/** Paid plans need at least ₦100 (prototype rule). */
export const MIN_SUBSCRIPTION_PRICE_KOBO = 10_000;
export const MAX_SUBSCRIPTION_PRICE_KOBO = 100_000_000; // ₦1,000,000

/** How long before the end a renewal reminder / automatic charge happens. */
export const RENEWAL_LEAD_DAYS = 3;

export const DAY_MS = 24 * 60 * 60 * 1000;

export function durationLabel(days: number) {
  return SUBSCRIPTION_DURATIONS.find((d) => d.days === days)?.label ?? `${days} days`;
}

export type SubscriptionStatus = "active" | "ending" | "expired";

/**
 * Derived from the date alone — nothing has to run for a subscription to
 * expire. "ending": still active, auto-renew off, ends within RENEWAL_LEAD_DAYS.
 */
export function subscriptionStatus(sub: { currentPeriodEnd: Date | string; autoRenew: boolean }, now = Date.now()): SubscriptionStatus {
  const end = new Date(sub.currentPeriodEnd).getTime();
  if (end <= now) return "expired";
  if (!sub.autoRenew && end - now <= RENEWAL_LEAD_DAYS * DAY_MS) return "ending";
  return "active";
}

/** "about ₦X / month" for a longer plan. */
export function monthlyEquivalentKobo(priceKobo: number, days: number) {
  return Math.round((priceKobo * 30) / days);
}
