import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredMessages } from "@/lib/messages";

export const runtime = "nodejs";

/**
 * Daily: hard-deletes disappearing direct messages past their expiry
 * (lib/messages). They are hidden from both people the moment they expire;
 * this just removes them from the database. Same GET + CRON_SECRET auth as
 * the other internal crons.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ purged: await purgeExpiredMessages() });
}
