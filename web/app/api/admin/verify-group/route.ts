import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/session";
import { requireModeratorPanel } from "@/lib/moderation/panelAccess";
import { db } from "@/lib/db";

// Groups with a pending "apply for verification" request — otherwise a
// moderator would have to already know a name to look it up.
export async function GET(req: NextRequest) {
  try {
    await requireModeratorPanel(req, "verifyGroup");
    const pending = await db.fanbaseGroup.findMany({
      where: { verificationRequestedAt: { not: null }, isVerified: false },
      orderBy: { verificationRequestedAt: "asc" },
      select: { id: true, name: true, verificationRequestedAt: true, creator: { select: { handle: true, displayName: true } } },
    });
    return NextResponse.json({ pending });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

// Mirrors /api/admin/verify (creator verification) — a blunt moderator-only
// toggle, looked up by group name rather than a queue UI. Clears any pending
// verificationRequestedAt either way (approved or explicitly unverified).
const bodySchema = z.object({ name: z.string().min(1), verified: z.boolean() });

export async function POST(req: NextRequest) {
  try {
    await requireModeratorPanel(req, "verifyGroup");
    const { name, verified } = bodySchema.parse(await req.json());

    const group = await db.fanbaseGroup.findFirst({ where: { name: { equals: name.trim(), mode: "insensitive" } } });
    if (!group) return NextResponse.json({ error: "No Fanbase group with that name" }, { status: 404 });

    const updated = await db.fanbaseGroup.update({
      where: { id: group.id },
      data: { isVerified: verified, verificationRequestedAt: null },
    });
    return NextResponse.json({ name: updated.name, isVerified: updated.isVerified });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
