import { NextRequest, NextResponse } from "next/server";
import { isBotUserAgent, recordVisit } from "@/lib/analytics/visits";

// Public page-view beacon (components/analytics/VisitTracker.tsx). Always
// answers 204 — a tracking failure must never surface to the visitor.
export async function POST(req: NextRequest) {
  try {
    const userAgent = req.headers.get("user-agent");
    if (isBotUserAgent(userAgent)) return new NextResponse(null, { status: 204 });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    await recordVisit({ ip, userAgent: userAgent!, country: req.headers.get("x-vercel-ip-country") });
  } catch (err) {
    console.error("recordVisit failed", err);
  }
  return new NextResponse(null, { status: 204 });
}
