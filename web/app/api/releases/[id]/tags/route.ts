import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GENRE_SLUGS, MOOD_SLUGS, MIN_GENRES, MAX_GENRES, MAX_MOODS } from "@/lib/music/tags";

const bodySchema = z.object({
  genres: z.array(z.enum(GENRE_SLUGS)).min(MIN_GENRES, "Pick at least one genre").max(MAX_GENRES),
  moods: z.array(z.enum(MOOD_SLUGS)).max(MAX_MOODS).default([]),
});

// A release's genres/moods (Music tab, V1.2). Separate from PATCH
// /api/releases/[id] on purpose: that one closes after the edit window, but
// tagging only affects where a release is found — artists tagging songs
// uploaded before genres existed is the whole point.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = bodySchema.parse(await req.json());
    const product = await db.product.findUnique({ where: { id }, select: { creatorId: true, type: true, status: true } });
    if (!product || product.type !== "RELEASE" || product.creatorId !== user.id || product.status === "DELETED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const release = await db.release.update({
      where: { productId: id },
      data: { genres: [...new Set(body.genres)], moods: [...new Set(body.moods)] },
      select: { genres: true, moods: true },
    });
    return NextResponse.json(release);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid tags" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not save tags" }, { status: 500 });
  }
}
