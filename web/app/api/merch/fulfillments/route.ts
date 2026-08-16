import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Every paid order for anything this creator sells as MERCH, most recent
// first. Only PAID orders show up here — a PENDING/FAILED order's shipping
// address was collected at checkout time but never became a real sale.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const orders = await db.order.findMany({
      where: {
        status: "PAID",
        merchFulfillment: { isNot: null },
        items: { some: { product: { creatorId: user.id, type: "MERCH" } } },
      },
      include: {
        buyer: { select: { displayName: true, handle: true } },
        merchFulfillment: true,
        items: { include: { product: { select: { id: true, title: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ orders });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
