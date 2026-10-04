import { NextRequest, NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { db } from "@/lib/db";
import { getCommissionRates } from "@/lib/commerce/ledger";
import { getCreatorPlanSettings } from "@/lib/commerce/creatorPlans";

const PAGE_SIZE = 10;
const TYPES = ["RELEASE", "BEAT", "MERCH", "EVENT"] as const;
const STATUSES = ["DRAFT", "PUBLISHED", "DELETED"] as const;

// Same shape as GET /api/admin/users: requireModerator, q + page,
// Promise.all([count, findMany]), offset pagination — the moderator
// dashboard's product-management panel (DECISIONS.md) lists every product
// on the platform, not just a creator's own.
export async function GET(req: NextRequest) {
  try {
    await requireModeratorPanel(req, "products");

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const typeParam = req.nextUrl.searchParams.get("type");
    const statusParam = req.nextUrl.searchParams.get("status");
    const type = TYPES.find((t) => t === typeParam);
    const status = STATUSES.find((s) => s === statusParam);

    const where = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { creator: { handle: { contains: q, mode: "insensitive" as const } } },
              { creator: { displayName: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [total, products, rates, creatorPlanSettings] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          type: true,
          title: true,
          priceKobo: true,
          status: true,
          createdAt: true,
          publishedAt: true,
          creator: { select: { handle: true, displayName: true, creatorPlan: true } },
          stockPolicy: { select: { sold: true, cap: true } },
        },
      }),
      // Fetched once for the whole page rather than per row (explicit ask:
      // "check the percentage live for all products") — same branching as
      // lib/commerce/productModeration.ts's getApplicableCommissionPercent,
      // just batched so a 10-row page doesn't re-read PlatformSettings 10
      // times over.
      getCommissionRates(),
      getCreatorPlanSettings(),
    ]);

    function commissionPercentFor(p: (typeof products)[number]) {
      if (p.creator.creatorPlan === "LIMITED") return 0;
      if (p.creator.creatorPlan === "BUYER_PAYS_FEE") {
        return p.type === "EVENT" ? creatorPlanSettings.buyerPaysFeeEventPercent : creatorPlanSettings.buyerPaysFeePercent;
      }
      return Math.round(rates[p.type] * 100);
    }

    return NextResponse.json({
      products: products.map((p) => ({
        id: p.id,
        type: p.type,
        title: p.title,
        priceKobo: p.priceKobo,
        status: p.status,
        createdAt: p.createdAt,
        publishedAt: p.publishedAt,
        creator: { handle: p.creator.handle, displayName: p.creator.displayName },
        sold: p.stockPolicy?.sold ?? 0,
        cap: p.stockPolicy?.cap ?? null,
        commissionPercent: commissionPercentFor(p),
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
