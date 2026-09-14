import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { publicUrlFor } from "@/lib/storage/r2";

export async function GET(req: NextRequest) {
  try {
    await requireModerator(req);
    const billboards = await db.billboard.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { creator: { select: { handle: true, displayName: true } } },
    });
    return NextResponse.json({ billboards });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const bodySchema = z.object({
  artworkKey: z.string().min(1),
  creatorHandle: z.string().optional(),
  durationDays: z.number().int().positive().max(365).optional(),
});

// Moderator-added billboard — no payment, no per-creator "one at a time"
// restriction (a house ad isn't a creator's slot).
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireModerator(req);
    const { artworkKey, creatorHandle, durationDays } = bodySchema.parse(await req.json());

    let creatorId: string | null = null;
    if (creatorHandle) {
      const creator = await db.user.findUnique({ where: { handle: creatorHandle } });
      if (!creator) return NextResponse.json({ error: `No user with handle @${creatorHandle}` }, { status: 404 });
      creatorId = creator.id;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (durationDays ?? 1) * 24 * 60 * 60 * 1000);
    const billboard = await db.billboard.create({
      data: {
        creatorId,
        artworkUrl: publicUrlFor(artworkKey),
        status: "ACTIVE",
        isModeratorAdded: true,
        activatedAt: now,
        expiresAt,
        updatedBy: user.id,
      },
    });
    return NextResponse.json({ billboard }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
