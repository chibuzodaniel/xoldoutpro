import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push/send";

export const runtime = "nodejs";
export const maxDuration = 120;

// Only nudge about recent activity — a bell left unread for months isn't
// worth a daily push forever.
const LOOKBACK_DAYS = 7;

/**
 * Daily "you have unread notifications" push (explicit ask: notifications
 * should be persistent and aggressive). Anyone with unread bell items from
 * the last week gets one reminder push per day, deep-linking to Socials
 * (where the bell lives). Push-only — it deliberately doesn't create a bell
 * row of its own, which would just inflate the very count it's reporting.
 * Vercel's Hobby plan caps crons at once a day (vercel.json), which is also
 * the right cadence for a reminder.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const unread = await db.notification.groupBy({
    by: ["userId"],
    // Not yet seen — opening the bell stops these, without having to open
    // every single notification.
    where: { seenAt: null, createdAt: { gte: since }, kind: { not: "REMINDER" } },
    _count: { _all: true },
  });

  // Same count → same message, so users are batched per distinct count.
  const usersByCount = new Map<number, string[]>();
  for (const u of unread) {
    const n = u._count._all;
    usersByCount.set(n, [...(usersByCount.get(n) ?? []), u.userId]);
  }

  for (const [count, userIds] of usersByCount) {
    await sendPushToUsers(userIds, {
      title: "You have unread notifications",
      body: count === 1 ? "1 thing is waiting for you on XOLDOUT." : `${count} things are waiting for you on XOLDOUT.`,
      url: "/socials",
      tag: "daily-reminder",
    });
  }

  return NextResponse.json({ reminded: unread.length });
}
