import { NextResponse } from "next/server";
import { getCreatorProfile } from "@/lib/creator/getCreatorProfile";

export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const data = await getCreatorProfile(handle);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    user: data.user,
    fansCount: data.fansCount,
    totalSold: data.totalSold,
    catalog: data.catalog,
    events: data.events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      coverImageLadder: ev.coverImageLadder,
      startsAt: ev.startsAt,
      tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
    })),
  });
}
