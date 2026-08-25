// PRD §12: verification badge. Criteria for who gets one is explicitly
// undecided (PRD §18) — this only renders the badge; granting it is either
// the moderator-only toggle (POST /api/admin/verify) or an approved
// VerificationApplication. The badge glyph itself doesn't vary by
// VerificationBadgeType — `label` just swaps the tooltip/aria-label so a
// SELLER_VERIFIED checkmark reads differently from IDENTITY_VERIFIED, etc.
const BADGE_LABEL: Record<string, string> = {
  IDENTITY_VERIFIED: "Identity verified",
  SELLER_VERIFIED: "Verified seller",
  CREATOR_VERIFIED: "Verified creator",
  OFFICIAL_ACCOUNT: "Official account",
  TRUSTED_BUSINESS: "Verified business",
  OFFICIAL_FANBASE: "Official fanbase",
  RECOGNIZED_COMMUNITY: "Recognized community",
};

export function VerifiedBadge({
  className = "h-3.5 w-3.5 text-red-soft shrink-0",
  badgeType,
}: {
  className?: string;
  badgeType?: string | null;
}) {
  const label = (badgeType && BADGE_LABEL[badgeType]) || "Verified";
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label={label}>
      <title>{label}</title>
      <path d="M12 2l2.4 2.2 3.2-.5 1 3.1 3 1.3-.7 3.2 2 2.7-2 2.7.7 3.2-3 1.3-1 3.1-3.2-.5L12 22l-2.4-2.2-3.2.5-1-3.1-3-1.3.7-3.2-2-2.7 2-2.7-.7-3.2 3-1.3 1-3.1 3.2.5z" />
      <path
        d="M8.5 12.2l2.4 2.4 4.6-4.8"
        fill="none"
        stroke="var(--color-bg, #0a0a0b)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
