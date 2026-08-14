import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { resolveAccount } from "@/lib/flutterwave";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const accounts = await db.payoutAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ accounts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const bodySchema = z.object({
  accountNumber: z.string().min(10).max(10),
  bankCode: z.string().min(1),
  bankName: z.string().min(1),
});

// PRD §13: "Account verification with name matching at the time an account
// is added, not at withdrawal time." Flutterwave's resolve endpoint returns
// the bank's name for the account — that becomes accountName, never
// something the user types themselves.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { accountNumber, bankCode, bankName } = bodySchema.parse(await req.json());

    const resolved = await resolveAccount(accountNumber, bankCode);

    const existingCount = await db.payoutAccount.count({ where: { userId: user.id } });
    const account = await db.payoutAccount.create({
      data: {
        userId: user.id,
        bankCode,
        bankName,
        accountNumber: resolved.accountNumber,
        accountName: resolved.accountName,
        isDefault: existingCount === 0,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not verify that account" }, { status: 502 });
  }
}
