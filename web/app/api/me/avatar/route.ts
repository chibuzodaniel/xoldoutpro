import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getObjectBuffer, putObjectBuffer, publicUrlFor } from "@/lib/storage/r2";
import { resizeSquare } from "@/lib/images";

const bodySchema = z.object({ key: z.string().min(1) });

// Client already uploaded the original to R2 via a presigned URL (kind: "avatar").
// This finalizes it: crop to a circle-safe square, resize down, re-upload the
// derivative, and point the user's avatarUrl at that — never the original.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { key } = bodySchema.parse(await req.json());
    if (!key.startsWith(`avatars/${user.id}/`)) {
      return NextResponse.json({ error: "Key does not belong to this user" }, { status: 403 });
    }

    const original = await getObjectBuffer(key);
    const resized = await resizeSquare(original, 512);
    const derivativeKey = `avatars/${user.id}/${randomUUID()}-512.jpg`;
    await putObjectBuffer(derivativeKey, resized, "image/jpeg");

    const avatarUrl = publicUrlFor(derivativeKey);
    const updated = await db.user.update({ where: { id: user.id }, data: { avatarUrl } });
    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const updated = await db.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
