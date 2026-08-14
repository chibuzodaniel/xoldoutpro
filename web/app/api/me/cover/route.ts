import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getObjectBuffer, putObjectBuffer, publicUrlFor } from "@/lib/storage/r2";
import { resizeBanner } from "@/lib/images";

const bodySchema = z.object({ key: z.string().min(1) });

// One fixed aspect ratio everywhere (PRD §12): 3:1 banner, cropped server-side,
// never letterboxed or stretched at render.
const COVER_WIDTH = 1200;
const COVER_HEIGHT = 400;

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { key } = bodySchema.parse(await req.json());
    if (!key.startsWith(`covers/${user.id}/`)) {
      return NextResponse.json({ error: "Key does not belong to this user" }, { status: 403 });
    }

    const original = await getObjectBuffer(key);
    const resized = await resizeBanner(original, COVER_WIDTH, COVER_HEIGHT);
    const derivativeKey = `covers/${user.id}/${randomUUID()}-${COVER_WIDTH}x${COVER_HEIGHT}.jpg`;
    await putObjectBuffer(derivativeKey, resized, "image/jpeg");

    const coverUrl = publicUrlFor(derivativeKey);
    const updated = await db.user.update({ where: { id: user.id }, data: { coverUrl } });
    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
