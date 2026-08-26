import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const PAGE_SIZE = 25;

// Explicit ask: "moderators should be able to see the list of users in
// their dashboard" — a searchable, paginated directory. Unlike
// ManageModeratorsPanel (which hides moderator emails from other
// moderators — a peer-privacy call), this lists ordinary users, where a
// moderator seeing an email is normal support/lookup context, so it's
// included. Offset pagination (not a cursor) matches the rest of this app's
// admin panels, which are all plain unbounded/simple lists — safe at the
// "tens to low-thousands of users" scale noted in /api/admin/stats.
export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
    const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "1";

    const where = {
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(q
        ? {
            OR: [
              { handle: { contains: q, mode: "insensitive" as const } },
              { displayName: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          handle: true,
          displayName: true,
          email: true,
          createdAt: true,
          deletedAt: true,
          isModerator: true,
          isVerified: true,
          _count: { select: { products: true } },
        },
      }),
    ]);

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        handle: u.handle,
        displayName: u.displayName,
        email: u.email,
        createdAt: u.createdAt,
        deletedAt: u.deletedAt,
        isModerator: u.isModerator,
        isVerified: u.isVerified,
        listingCount: u._count.products,
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
