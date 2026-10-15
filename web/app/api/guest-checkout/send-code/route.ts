import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendGuestCode, GuestVerificationError } from "@/lib/commerce/guestVerification";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
});

// Step 1 of the guest checkout email check — see lib/commerce/guestVerification.ts.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your name and a valid email address." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  try {
    await sendGuestCode({ ...parsed.data, ip });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof GuestVerificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Couldn't send the code. Try again." }, { status: 500 });
  }
}
