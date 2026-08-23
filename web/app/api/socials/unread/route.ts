import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getSocialsUnreadCount } from "@/lib/socials/unread";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const count = await getSocialsUnreadCount(user.id, user.socialsLastSeenAt);
    return NextResponse.json({ count });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

// Called when the Socials tab is actually opened — zeroes the badge by
// advancing the "last seen" watermark to now, rather than marking specific
// items read one by one.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    await db.user.update({ where: { id: user.id }, data: { socialsLastSeenAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
