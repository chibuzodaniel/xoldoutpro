import { NextRequest, NextResponse } from "next/server";
import { convertDueXgEarnings } from "@/lib/live/xgEarnings";

export const runtime = "nodejs";

/**
 * Daily XG -> wallet conversion (lib/live/xgEarnings.ts), scheduled by
 * vercel.json with the same GET + CRON_SECRET bearer auth as settle-ledger:
 * pays out every earning whose PlatformSettings.xgPayoutHoldDays hold has
 * ended. A failed run is simply picked up by the next day's.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await convertDueXgEarnings();
  return NextResponse.json(result);
}
