import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getObjectBuffer, putObjectBuffer, publicUrlFor } from "@/lib/storage/r2";
import { resizeSquare } from "@/lib/images";

const bodySchema = z.object({ key: z.string().min(1) });

// Mirrors /api/me/avatar — the client already uploaded the original to R2
// via the existing "avatar" presign kind (same content-type rules, same
// square-crop treatment fits a circular group photo), this finalizes it:
// resize, re-upload the derivative, point coverImageUrl at that.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { key } = bodySchema.parse(await req.json());

    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    if (membership?.role !== "ADMIN") {
      return NextResponse.json({ error: "Only an admin can change this group's photo" }, { status: 403 });
    }
    if (!key.startsWith(`avatars/${user.id}/`)) {
      return NextResponse.json({ error: "Key does not belong to this user" }, { status: 403 });
    }

    const original = await getObjectBuffer(key);
    const resized = await resizeSquare(original, 512);
    const derivativeKey = `avatars/${user.id}/${randomUUID()}-512.jpg`;
    await putObjectBuffer(derivativeKey, resized, "image/jpeg");

    const coverImageUrl = publicUrlFor(derivativeKey);
    const updated = await db.fanbaseGroup.update({ where: { id }, data: { coverImageUrl } });
    return NextResponse.json({ coverImageUrl: updated.coverImageUrl });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
