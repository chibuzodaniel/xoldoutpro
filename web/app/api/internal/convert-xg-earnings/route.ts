import { NextRequest, NextResponse } from "next/server";
import { convertDueXgEarnings } from "@/lib/live/xgEarnings";

export const runtime = "nodejs";

/**
 * Monthly XG -> wallet conversion (lib/live/xgEarnings.ts). Scheduled daily
 * by vercel.json, same GET + CRON_SECRET bearer auth as settle-ledger: only
 * earnings from before the current Lagos-time month are ever converted, so
 * every run but the first one of a month is a no-op, and a failed run on
 * the 1st is retried by the next day's.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await convertDueXgEarnings();
  return NextResponse.json(result);
}
