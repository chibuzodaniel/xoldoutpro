// PRD §12: verification badge. Criteria for who gets one is explicitly
// undecided (PRD §18) — this only renders the badge; granting it is either
// the moderator-only toggle (POST /api/admin/verify) or an approved
// VerificationApplication.
//
// Explicit ask, 2026-09-14: "all the verification batch should have
// different colors/designs to show the particular one the creator did" —
// each VerificationBadgeType now gets its own color, and the inner glyph
// groups them into three visual families (a plain checkmark for the three
// "this person is who/what they say" badges, a star for the two "officially
// recognized" ones, a diamond for the two institutional ones) — kept to
// three simple glyphs rather than seven bespoke ones so every badge stays
// legible at the ~14px size it's actually rendered at.
const BADGE_LABEL: Record<string, string> = {
  IDENTITY_VERIFIED: "Identity verified",
  SELLER_VERIFIED: "Verified seller",
  CREATOR_VERIFIED: "Verified creator",
  OFFICIAL_ACCOUNT: "Official account",
  TRUSTED_BUSINESS: "Verified business",
  OFFICIAL_FANBASE: "Official fanbase",
  RECOGNIZED_COMMUNITY: "Recognized community",
};

const BADGE_COLOR: Record<string, string> = {
  IDENTITY_VERIFIED: "text-blue-500",
  SELLER_VERIFIED: "text-green",
  CREATOR_VERIFIED: "text-red-soft",
  OFFICIAL_ACCOUNT: "text-amber-500",
  TRUSTED_BUSINESS: "text-purple-500",
  OFFICIAL_FANBASE: "text-pink-500",
  RECOGNIZED_COMMUNITY: "text-teal-500",
};

const BADGE_GLYPH: Record<string, "check" | "star" | "diamond"> = {
  IDENTITY_VERIFIED: "check",
  SELLER_VERIFIED: "check",
  CREATOR_VERIFIED: "check",
  OFFICIAL_ACCOUNT: "star",
  OFFICIAL_FANBASE: "star",
  TRUSTED_BUSINESS: "diamond",
  RECOGNIZED_COMMUNITY: "diamond",
};

const GLYPH_PATH: Record<"check" | "star" | "diamond", string> = {
  check: "M8.5 12.2l2.4 2.4 4.6-4.8",
  star: "M12 7.3l1.5 3.2 3.5.4-2.6 2.4.7 3.5-3.1-1.7-3.1 1.7.7-3.5-2.6-2.4 3.5-.4z",
  diamond: "M12 7.3l3.7 4.7-3.7 4.7-3.7-4.7z",
};

// A user can hold several badges at once (User.verificationBadges is an
// array — see that field's own schema comment); inline UI only has room
// for one, so this picks the most significant when there's more than one.
const BADGE_PRIORITY = [
  "OFFICIAL_ACCOUNT",
  "CREATOR_VERIFIED",
  "SELLER_VERIFIED",
  "TRUSTED_BUSINESS",
  "IDENTITY_VERIFIED",
] as const;

export function primaryBadgeType(badges: readonly string[] | null | undefined): string | null {
  if (!badges || badges.length === 0) return null;
  for (const type of BADGE_PRIORITY) {
    if (badges.includes(type)) return type;
  }
  return badges[0];
}

export function VerifiedBadge({
  className = "h-3.5 w-3.5 shrink-0",
  badgeType,
}: {
  className?: string;
  badgeType?: string | null;
}) {
  const label = (badgeType && BADGE_LABEL[badgeType]) || "Verified";
  const color = (badgeType && BADGE_COLOR[badgeType]) || "text-red-soft";
  const glyph = (badgeType && BADGE_GLYPH[badgeType]) || "check";
  return (
    <svg viewBox="0 0 24 24" className={`${className} ${color}`} fill="currentColor" aria-label={label}>
      <title>{label}</title>
      <path d="M12 2l2.4 2.2 3.2-.5 1 3.1 3 1.3-.7 3.2 2 2.7-2 2.7.7 3.2-3 1.3-1 3.1-3.2-.5L12 22l-2.4-2.2-3.2.5-1-3.1-3-1.3.7-3.2-2-2.7 2-2.7-.7-3.2 3-1.3 1-3.1 3.2.5z" />
      <path
        d={GLYPH_PATH[glyph]}
        fill="none"
        stroke="var(--color-bg, #0a0a0b)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
