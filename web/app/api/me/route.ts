import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { adminAuth } from "@/lib/firebase/admin";
import { sendAccountDeletedEmail } from "@/lib/email";

const SITE_URL = "https://www.xoldout.app";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

// Tags are self-assigned and descriptive only — PRD §1.4: never an authorisation check.
// The set is open (any string up to 24 chars), the four below are just the suggested chips.
export const SUGGESTED_TAGS = ["Artist", "Producer", "Manager", "Label"] as const;

const socialLinkSchema = z.object({
  platform: z.enum(["Instagram", "X", "TikTok", "YouTube", "Website"]),
  url: z.string().url().max(300),
});

const patchSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers, underscore only")
    .optional(),
  displayName: z.string().min(1).max(60).optional(),
  bio: z.string().max(280).optional(),
  tags: z.array(z.string().min(1).max(24)).max(8).optional(),
  socialLinks: z.array(socialLinkSchema).max(6).optional(),
  pushEnabled: z.boolean().optional(),
  fcmTokens: z.array(z.string()).optional(),
  emailDigestSubscribed: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = patchSchema.parse(await req.json());

    if (body.handle && body.handle !== user.handle) {
      const taken = await db.user.findUnique({ where: { handle: body.handle } });
      if (taken) return NextResponse.json({ error: "Handle already taken" }, { status: 409 });
    }

    const updated = await db.user.update({ where: { id: user.id }, data: body });
    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const deleteSchema = z.object({ confirmation: z.string() });

// Soft delete: scrubs nothing yet (see prisma/schema.prisma's deletedAt
// comment) — sets deletedAt, mutes push/email, and revokes the Firebase
// refresh token so any other signed-in device is logged out. Deliberately
// does NOT disable the Firebase Auth account: the owner still needs to be
// able to sign back in, at /recoveraccount/[handle], to recover within the
// window (POST /api/account/recover). Every other endpoint's requireUser()
// rejects this account until then.
export async function DELETE(req: NextRequest) {
  try {
    const { user, decoded } = await requireUser(req);
    const { confirmation } = deleteSchema.parse(await req.json());

    if (confirmation !== `DELETE ${user.handle}`) {
      return NextResponse.json({ error: `Type "DELETE ${user.handle}" exactly to confirm` }, { status: 400 });
    }

    await db.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), pushEnabled: false, fcmTokens: [], emailDigestSubscribed: false },
    });

    await adminAuth()
      .revokeRefreshTokens(decoded.uid)
      .catch((err) => console.error("[account-delete] revokeRefreshTokens failed", err));

    await sendAccountDeletedEmail({
      to: user.email,
      displayName: user.displayName,
      recoveryUrl: `${SITE_URL}/recoveraccount/${user.handle}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
