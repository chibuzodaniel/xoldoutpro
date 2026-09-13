export type ImageLadder = Record<string, string> | null;

export type StockPolicy = { cap: number | null; sold: number; soldOutAt: string | null } | null;

export type ProductCreator = { handle: string; displayName: string };

export type ProductCardData = {
  id: string;
  type: "RELEASE" | "BEAT" | "MERCH";
  title: string;
  priceKobo: number;
  creator: ProductCreator;
  release: { artworkLadder: ImageLadder; releaseType: string } | null;
  beat: { coverImageLadder: ImageLadder } | null;
  merchItem: { imageLadder: ImageLadder } | null;
  stockPolicy: StockPolicy;
};

export type WeeklyTopCreator = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  metric: string;
};

export type FeaturedCreator = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  _count: { followers: number };
};

export type EventTier = { priceKobo: number; stockPolicy: StockPolicy };

export type EventData = {
  id: string;
  title: string;
  coverImageLadder: ImageLadder;
  startsAt: string;
  tiers: EventTier[];
};

export type DiscoverData = {
  hero: ProductCardData | null;
  heroWeeklySold: number;
  newReleasesBelowHero: ProductCardData[];
  recommended: ProductCardData[];
  weeklyTopCreators: WeeklyTopCreator[];
  topBeats: ProductCardData[];
  merchItems: ProductCardData[];
  creators: FeaturedCreator[];
  upcomingEvents: EventData[];
};
