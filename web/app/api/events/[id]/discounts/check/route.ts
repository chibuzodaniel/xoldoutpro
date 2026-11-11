import { NextRequest, NextResponse } from "next/server";
import { previewDiscount, MarketplaceError } from "@/lib/event/marketplace";

// "Use discount code": checks a code for a ticket type and returns the new
// price. Checkout re-checks everything on its own (app/api/orders).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const code = req.nextUrl.searchParams.get("code")?.slice(0, 40) ?? "";
  const tier = req.nextUrl.searchParams.get("tier") ?? "";
  if (!code.trim() || !tier) return NextResponse.json({ error: "Enter a code" }, { status: 400 });
  try {
    return NextResponse.json(await previewDiscount({ eventId: id, tierProductId: tier, code }));
  } catch (err) {
    if (err instanceof MarketplaceError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
