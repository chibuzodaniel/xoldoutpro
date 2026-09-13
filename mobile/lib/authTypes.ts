export type SocialLink = { platform: "Instagram" | "X" | "TikTok" | "YouTube" | "Website"; url: string };

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
};
