// title and enabled come from the web link-in-bio manager (lib/profile/links.ts on web);
// this app keeps them as-is when it re-saves the list.
export type SocialLink = { platform: "Instagram" | "X" | "TikTok" | "YouTube" | "Website"; url: string; title?: string | null; enabled?: boolean };

export type AppUser = {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  tags: string[];
  socialLinks: SocialLink[];
  isVerified: boolean;
  verificationBadges: string[];
  pushEnabled: boolean;
  emailDigestSubscribed: boolean;
  // Creator plans (DECISIONS.md) — null until first chosen.
  creatorPlan: "UNLIMITED" | "BUYER_PAYS_FEE" | "LIMITED" | null;
  limitedUploadsUsed: number;
  buyerPaysFeeBonusSlots: number;
};
