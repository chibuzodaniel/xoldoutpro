import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { agreementText, type LicenseTerms } from "@/lib/commerce/licenseTerms";

// The buyer's beat license agreement as a .txt download (v2, 2026-11-09).
// Built from the license snapshot on their own paid order line, so it always
// matches what they agreed to at checkout. Beats bought before license tiers
// existed get the standard single license from /legal/terms.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const item = await db.orderItem.findFirst({
      where: { productId: id, quantity: { gt: 0 }, order: { buyerId: user.id, status: "PAID", isTipOnly: false } },
      orderBy: { order: { createdAt: "desc" } },
      select: {
        priceKobo: true,
        licenseName: true,
        licenseTerms: true,
        order: { select: { id: true, createdAt: true } },
        product: { select: { title: true, type: true, creator: { select: { displayName: true, handle: true } } } },
      },
    });
    if (!item || item.product.type !== "BEAT") return NextResponse.json({ error: "You don't own this beat" }, { status: 404 });

    const snap = item.licenseTerms as { formats?: string[]; isExclusive?: boolean; terms?: LicenseTerms } | null;
    const terms: LicenseTerms = snap?.terms ?? {
      // The single license every beat sold under before tiers (/legal/terms §4).
      streams: null,
      commercialUse: true,
      monetization: true,
      distribution: true,
      musicVideo: true,
      youtube: "monetized",
      radio: true,
      livePerformances: null,
      contentId: false,
      durationYears: null,
      credit: "",
    };

    const text = agreementText({
      beatTitle: item.product.title,
      producer: `${item.product.creator.displayName} (@${item.product.creator.handle})`,
      buyer: `${user.displayName} (@${user.handle})`,
      licenseName: item.licenseName ?? "Standard",
      formats: snap?.formats ?? ["MP3"],
      isExclusive: snap?.isExclusive ?? false,
      terms,
      pricePaidKobo: item.priceKobo,
      orderId: item.order.id,
      purchasedAt: item.order.createdAt,
    });

    const filename = `${item.product.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "beat"}-license.txt`;
    return new NextResponse(text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
