export type CatalogStockPolicy = { cap: number | null; sold: number; soldOutAt: string | null };

export type CatalogRelease = {
  id: string;
  title: string;
  description: string;
  priceKobo: number;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  publishedAt: string | null;
  release: { artworkLadder: Record<string, string> | null } | null;
  stockPolicy: CatalogStockPolicy | null;
};

export type CatalogBeat = {
  id: string;
  title: string;
  description: string;
  priceKobo: number;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  publishedAt: string | null;
  beat: { coverImageLadder: Record<string, string> | null } | null;
  stockPolicy: CatalogStockPolicy | null;
};

export type CatalogMerchItem = {
  id: string;
  title: string;
  description: string;
  priceKobo: number;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  publishedAt: string | null;
  merchItem: { imageLadder: Record<string, string> | null; shippingFeeKobo: number } | null;
  stockPolicy: CatalogStockPolicy | null;
};

export type CatalogTier = {
  productId: string;
  name: string;
  product: {
    priceKobo: number;
    publishedAt: string | null;
    stockPolicy: CatalogStockPolicy | null;
  };
};

export type CatalogEvent = {
  id: string;
  title: string;
  description: string;
  venue: string | null;
  startsAt: string;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  publishedAt: string | null;
  coverImageLadder: Record<string, string> | null;
  tiers: CatalogTier[];
};
