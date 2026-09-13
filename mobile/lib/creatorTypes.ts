import type { EventData, ProductCardData } from "./discoverTypes";

export type CreatorProfile = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    coverUrl: string | null;
    tags: string[];
    socialLinks: { platform: string; url: string }[];
    isVerified: boolean;
  };
  fansCount: number;
  totalSold: number;
  catalog: ProductCardData[];
  events: EventData[];
};
