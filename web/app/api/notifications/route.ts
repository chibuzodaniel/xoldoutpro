import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// The header bell's list — transactional/money events only (see
// lib/notifications/create.ts). Capped at 50 since this is a recent-activity
// list, not an archive with pagination.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
