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
  earnedByCategory: Record<string, number>;
  payouts: Payout[];
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

export type MeStats = {
  fans: number;
  sales: number;
  catalog: { music: number; beats: number; events: number; merch: number };
  pendingFanbaseRequests: number;
};
