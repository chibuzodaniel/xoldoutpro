import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBotUserAgent } from "@/lib/analytics/visits";
import { addBillboardViews } from "@/lib/commerce/billboards";

const bodySchema = z.object({ counts: z.record(z.string().max(40), z.number().int().nonnegative()) });

// Public impression beacon from components/discover/BillboardRail (web) and
// mobile's BillboardRail: { counts: { [billboardId]: impressionsSinceLastBeacon } }.
// Every on-screen display counts (explicit ask — not unique viewers). Always
// 204: a counting failure must never surface to the viewer.
export async function POST(req: NextRequest) {
  try {
    if (isBotUserAgent(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
    const raw = await req.text();
    const { counts } = bodySchema.parse(JSON.parse(raw));
    if (Object.keys(counts).length <= 20) await addBillboardViews(counts);
  } catch (err) {
    if (!(err instanceof z.ZodError) && !(err instanceof SyntaxError)) console.error("billboard views failed", err);
  }
  return new NextResponse(null, { status: 204 });
}
