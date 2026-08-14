import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const account = await db.payoutAccount.findUnique({ where: { id } });
    if (!account || account.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.$transaction([
      db.payoutAccount.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
      db.payoutAccount.update({ where: { id }, data: { isDefault: true } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
