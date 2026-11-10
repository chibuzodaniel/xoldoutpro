// Communities (v2, design/v2-prototype, 2026-11-09) — shared constants and
// pure helpers, safe for client components.

export const COMMUNITY_CATEGORIES = [
  "Music Communities",
  "Recording Clubs",
  "Artiste Fan Clubs",
  "Producer Communities",
  "Creative Organizations",
  "Exclusive Communities",
  "Other",
] as const;

export const DIRECTORY_FILTERS = [
  { key: "featured", label: "Featured" },
  { key: "trending", label: "Trending" },
  { key: "new", label: "New" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
] as const;
export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number]["key"];

export const PLAN_CYCLES = [
  { key: "MONTHLY", label: "Monthly", per: "month", days: 30 },
  { key: "YEARLY", label: "Yearly", per: "year", days: 365 },
  { key: "ONE_TIME", label: "One-time", per: null, days: null },
] as const;
export type PlanCycle = (typeof PLAN_CYCLES)[number]["key"];

/** Paid plans need at least ₦100 (prototype rule); 0 = free. */
export const MIN_PAID_PLAN_KOBO = 10_000;
export const MAX_PLANS = 6;
export const MAX_CHANNELS = 20;

export const DAY_MS = 24 * 60 * 60 * 1000;

export function cycleDays(cycle: string): number | null {
  return PLAN_CYCLES.find((c) => c.key === cycle)?.days ?? null;
}

export function planPriceLabel(plan: { priceKobo: number; cycle: string }) {
  if (plan.priceKobo === 0) return "Free";
  const naira = `₦${(plan.priceKobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  const per = PLAN_CYCLES.find((c) => c.key === plan.cycle)?.per;
  return per ? `${naira}/${per}` : naira;
}

type MembershipLike = { expiresAt: Date | string | null; suspendedAt?: Date | string | null };

/** A membership counts while it isn't suspended and has no end date or the end is still ahead. */
export function isMembershipActive(m: MembershipLike | null | undefined, now = Date.now()) {
  return Boolean(m && !m.suspendedAt && (!m.expiresAt || new Date(m.expiresAt).getTime() > now));
}

export type MembershipState = "active" | "expired" | "suspended";
export function membershipState(m: MembershipLike, now = Date.now()): MembershipState {
  if (m.suspendedAt) return "suspended";
  return !m.expiresAt || new Date(m.expiresAt).getTime() > now ? "active" : "expired";
}

/** Can this member open this channel? Admins always can. */
export function canOpenChannel(
  channel: { planIds: string[] },
  member: { role: string; planId: string | null; expiresAt: Date | string | null; suspendedAt?: Date | string | null } | null | undefined,
  isOwner = false,
) {
  if (isOwner || member?.role === "ADMIN") return true;
  if (!isMembershipActive(member)) return false;
  return channel.planIds.length === 0 || (member?.planId != null && channel.planIds.includes(member.planId));
}
