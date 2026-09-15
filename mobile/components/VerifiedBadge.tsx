import { Svg, Path } from "react-native-svg";

// Ported from web's components/profile/VerifiedBadge.tsx — same seven badge
// types, same color-per-type + three-glyph-family scheme (explicit ask,
// 2026-09-14: distinct colors/designs per verification type).
const BADGE_COLOR: Record<string, string> = {
  IDENTITY_VERIFIED: "#3b82f6",
  SELLER_VERIFIED: "#22c55e",
  CREATOR_VERIFIED: "#ff5a68",
  OFFICIAL_ACCOUNT: "#f59e0b",
  TRUSTED_BUSINESS: "#a855f7",
  OFFICIAL_FANBASE: "#ec4899",
  RECOGNIZED_COMMUNITY: "#14b8a6",
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

const BADGE_PRIORITY = ["OFFICIAL_ACCOUNT", "CREATOR_VERIFIED", "SELLER_VERIFIED", "TRUSTED_BUSINESS", "IDENTITY_VERIFIED"] as const;

export function primaryBadgeType(badges: readonly string[] | null | undefined): string | null {
  if (!badges || badges.length === 0) return null;
  for (const type of BADGE_PRIORITY) {
    if (badges.includes(type)) return type;
  }
  return badges[0];
}

export function VerifiedBadge({ size = 14, badgeType }: { size?: number; badgeType?: string | null }) {
  const color = (badgeType && BADGE_COLOR[badgeType]) || "#ff5a68";
  const glyph = (badgeType && BADGE_GLYPH[badgeType]) || "check";
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2l2.4 2.2 3.2-.5 1 3.1 3 1.3-.7 3.2 2 2.7-2 2.7.7 3.2-3 1.3-1 3.1-3.2-.5L12 22l-2.4-2.2-3.2.5-1-3.1-3-1.3.7-3.2-2-2.7 2-2.7-.7-3.2 3-1.3 1-3.1 3.2.5z"
        fill={color}
      />
      <Path d={GLYPH_PATH[glyph]} fill="none" stroke="#0a0a0b" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
