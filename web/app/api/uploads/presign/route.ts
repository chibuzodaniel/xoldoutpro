import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { presignUpload } from "@/lib/storage/r2";

// What a client is allowed to ask for a direct-to-R2 upload URL for.
// Namespacing every key under the user's id keeps uploads from colliding
// or letting one user overwrite another's object.
const KIND_CONFIG = {
  avatar: { prefix: "avatars", contentTypes: ["image/jpeg", "image/png", "image/webp"] },
  cover: { prefix: "covers", contentTypes: ["image/jpeg", "image/png", "image/webp"] },
  artwork: { prefix: "artwork", contentTypes: ["image/jpeg", "image/png", "image/webp"] },
  audio: { prefix: "audio", contentTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave"] },
} as const;

const bodySchema = z.object({
  kind: z.enum(["avatar", "cover", "artwork", "audio"]),
  contentType: z.string(),
  extension: z.string().regex(/^[a-z0-9]{1,5}$/),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { kind, contentType, extension } = bodySchema.parse(await req.json());

    const config = KIND_CONFIG[kind];
    if (!config.contentTypes.includes(contentType as never)) {
      return NextResponse.json({ error: `Unsupported content-type for ${kind}: ${contentType}` }, { status: 400 });
    }

    const key = `${config.prefix}/${user.id}/${randomUUID()}.${extension}`;
    const uploadUrl = await presignUpload(key, contentType);
    return NextResponse.json({ key, uploadUrl });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
