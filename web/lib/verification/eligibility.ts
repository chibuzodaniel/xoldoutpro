import { db } from "@/lib/db";

export type VerificationType = "IDENTITY" | "SELLER" | "CREATOR" | "OFFICIAL" | "BUSINESS" | "FANBASE";

// A "valid sale" is a live (non-refunded) Entitlement on one of the
// creator's own products — Entitlement is created exactly once, at
// successful payment (or gift claim), and revoked exactly once, on refund,
// so it's already the single source of truth for "this sale still counts."
// Deliberately not OrderItem/PAID-order counting (matches /api/analytics'
// unitsSold in spirit, but that route only tracks StockPolicy.sold, which
// doesn't exist for uncapped products).
export async function getValidSalesCount(userId: string): Promise<number> {
  return db.entitlement.count({
    where: { revokedAt: null, product: { creatorId: userId } },
  });
}

// Result of a single eligibility check, persisted verbatim into
// VerificationApplication.eligibilitySnapshot at submit time — an audit
// trail proving the applicant really was eligible when they applied.
export type EligibilityResult = {
  eligible: boolean;
  reason?: string;
  checkedAt: string;
  stats: Record<string, number | string | boolean | null>;
};

// PRD §12/§18 leaves "who gets a badge, on what evidence" explicitly
// undecided — these gates are a judgment call (documented in DECISIONS.md),
// kept deliberately light: they block obviously-premature applications
// (e.g. a FANBASE application for a group you don't run) but every type
// still goes through human review for the evidence itself. Reviewers can
// always REJECT a technically-eligible application; eligibility here only
// decides whether the *form* is even reachable.
export async function checkVerificationEligibility(
  userId: string,
  type: VerificationType,
  groupId?: string | null,
): Promise<EligibilityResult> {
  const checkedAt = new Date().toISOString();

  if (type === "IDENTITY") {
    // No prerequisite — identity verification is the baseline anyone can
    // request; the evidence (government ID + selfie) is the whole review.
    return { eligible: true, checkedAt, stats: {} };
  }

  if (type === "OFFICIAL") {
    // Public-figure proof-of-authority claims can't be gated on platform
    // activity (a first-time account may still be a real public figure) —
    // reachable by anyone, decided entirely on submitted evidence.
    return { eligible: true, checkedAt, stats: {} };
  }

  if (type === "SELLER" || type === "BUSINESS") {
    const publishedProducts = await db.product.count({ where: { creatorId: userId, status: "PUBLISHED" } });
    const validSales = await getValidSalesCount(userId);
    const eligible = publishedProducts > 0;
    return {
      eligible,
      reason: eligible ? undefined : "You need at least one published listing before applying.",
      checkedAt,
      stats: { publishedProducts, validSales },
    };
  }

  if (type === "CREATOR") {
    const publishedWorks = await db.product.count({
      where: { creatorId: userId, status: "PUBLISHED", type: { in: ["RELEASE", "BEAT"] } },
    });
    const eligible = publishedWorks > 0;
    return {
      eligible,
      reason: eligible ? undefined : "You need at least one published release or beat before applying.",
      checkedAt,
      stats: { publishedWorks },
    };
  }

  // FANBASE
  if (!groupId) {
    return { eligible: false, reason: "A group must be selected.", checkedAt, stats: {} };
  }
  const group = await db.fanbaseGroup.findUnique({ where: { id: groupId }, select: { creatorId: true } });
  if (!group) return { eligible: false, reason: "Group not found.", checkedAt, stats: {} };
  const eligible = group.creatorId === userId;
  return {
    eligible,
    reason: eligible ? undefined : "Only the group's creator can apply to verify it.",
    checkedAt,
    stats: { isGroupCreator: eligible },
  };
}

// 50-valid-sales milestone (schema: User.salesMilestoneNotifiedAt): a
// one-time nudge encouraging an active seller to apply for SELLER
// verification, not an eligibility gate — SELLER eligibility above only
// requires one published listing. Threshold is a judgment call (no PRD
// number), chosen as a level that means "this is a real, ongoing seller,"
// not a one-off sale.
const SALES_MILESTONE_THRESHOLD = 50;

export async function checkSalesMilestone(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { salesMilestoneNotifiedAt: true } });
  if (user.salesMilestoneNotifiedAt) return { shouldNotify: false, validSalesCount: null };

  const validSalesCount = await getValidSalesCount(userId);
  return { shouldNotify: validSalesCount >= SALES_MILESTONE_THRESHOLD, validSalesCount };
}
