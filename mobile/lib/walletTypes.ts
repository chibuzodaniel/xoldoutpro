export type PayoutAccount = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
};

export type Bank = { code: string; name: string };

export type Payout = {
  id: string;
  amountKobo: number;
  feeKobo: number;
  netKobo: number;
  status: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  processorRef: string | null;
  createdAt: string;
  payoutAccount: { bankName: string; accountNumber: string; accountName: string };
};

export type WalletData = {
  availableKobo: number;
  pendingKobo: number;
  totalEarnedKobo: number;
  totalWithdrawnKobo: number;
  totalRefundedKobo: number;
  otherSpentKobo: number;
  earnedByCategory: Record<string, number>;
  payouts: Payout[];
  commissionPercent: { RELEASE: number; BEAT: number; MERCH: number; EVENT: number };
  // Earned Live XG still being held before payout (web's lib/live/xgEarnings.ts).
  xgEarnings: { balanceXg: number; balanceKobo: number; nextPayoutAt: string | null; nextPayoutKobo: number };
};

export type ProductStat = {
  id: string;
  title: string;
  type: "RELEASE" | "BEAT" | "EVENT" | "MERCH";
  cap: number | null;
  sold: number;
  soldOutAt: string | null;
  sellThroughPct: number | null;
  timeToSellOutHours: number | null;
};

export type AnalyticsData = {
  totals: {
    unitsSold: number;
    fans: number;
    newFans30d: number;
    totalCustomers: number;
    returningCustomers: number;
    sellOutRatePct: number | null;
  };
  topProducts: ProductStat[];
};

// GET /api/analytics/buyers — mirrors web's components/sales/BuyersList.tsx.
export type BuyerSale = {
  id: string;
  productTitle: string;
  productType: string;
  quantity: number;
  status: string;
  createdAt: string;
  buyer: { id: string; handle: string; displayName: string };
  isGift: boolean;
  giftStatus: string | null;
  giftExpiresAt: string | null;
  giftClaimedByHandle: string | null;
  refundReason: string | null;
  plays: number | null;
  downloadedOfflineAt: string | null;
  downloadedFileAt: string | null;
};

export type BuyerBreakdown = {
  buyer: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  paidUnits: number;
  refundedUnits: number;
  firstAt: string;
  lastAt: string;
  products: {
    productId: string;
    title: string;
    type: string;
    units: number;
    refunded: number;
    gift: boolean;
    plays: number | null;
    downloadedOfflineAt: string | null;
    downloadedFileAt: string | null;
  }[];
};

export type BuyersData = {
  summary: { paidUnits: number; refundedUnits: number; uniqueBuyers: number };
  sales: BuyerSale[];
  buyers: BuyerBreakdown[];
};

export type MeStats = {
  fans: number;
  sales: number;
  catalog: { music: number; beats: number; events: number; merch: number };
  pendingFanbaseRequests: number;
};
