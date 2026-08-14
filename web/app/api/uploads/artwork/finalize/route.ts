import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getObjectBuffer, putObjectBuffer, publicUrlFor } from "@/lib/storage/r2";
import { artworkLadder } from "@/lib/images";

const bodySchema = z.object({ key: z.string().min(1) });

// PRD §7.1: artwork is square, cropped at selection, resized into a ladder
// server-side. Returns the ladder so the client can hold it in wizard state
// until the release itself is created.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { key } = bodySchema.parse(await req.json());
    if (!key.startsWith(`artwork/${user.id}/`)) {
      return NextResponse.json({ error: "Key does not belong to this user" }, { status: 403 });
    }

    const original = await getObjectBuffer(key);
    const variants = await artworkLadder(original);
    const id = randomUUID();

    const ladder: Record<string, string> = {};
    await Promise.all(
      variants.map(async ([size, buf]) => {
        const derivativeKey = `artwork/${user.id}/${id}-${size}.jpg`;
        await putObjectBuffer(derivativeKey, buf, "image/jpeg");
        ladder[size] = publicUrlFor(derivativeKey);
      }),
    );

    return NextResponse.json({ artworkLadder: ladder });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not process artwork" }, { status: 500 });
  }
}
