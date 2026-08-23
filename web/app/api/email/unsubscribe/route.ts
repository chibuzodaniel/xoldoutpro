import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const bodySchema = z.object({ token: z.string().min(1) });

// Deliberately unauthenticated — clicked from an email client, not the app,
// so there's no Firebase session to attach. The unsubscribe token itself
// (User.unsubscribeToken) is the only credential, same as any standard
// email unsubscribe link.
export async function POST(req: NextRequest) {
  try {
    const { token } = bodySchema.parse(await req.json());
    const user = await db.user.findUnique({ where: { unsubscribeToken: token } });
    if (!user) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });

    await db.user.update({ where: { id: user.id }, data: { emailDigestSubscribed: false } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
