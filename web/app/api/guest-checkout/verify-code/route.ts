import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyGuestCode, GuestVerificationError } from "@/lib/commerce/guestVerification";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/),
});

// Step 2 of the guest checkout email check — returns the token POST
// /api/orders needs for a guest order. See lib/commerce/guestVerification.ts.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code from the email." }, { status: 400 });
  try {
    const verificationToken = await verifyGuestCode(parsed.data);
    return NextResponse.json({ verificationToken });
  } catch (err) {
    if (err instanceof GuestVerificationError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Couldn't check the code. Try again." }, { status: 500 });
  }
}
