import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAccountWithCode, SignupError } from "@/lib/auth/signupWithCode";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  code: z.string().trim().regex(/^\d{6}$/),
});

// Sign-up step 2: the code from the email, then the account is created
// (verified) and a custom token comes back for signInWithCustomToken.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code from the email." }, { status: 400 });
  try {
    const customToken = await createAccountWithCode(parsed.data);
    return NextResponse.json({ customToken });
  } catch (err) {
    if (err instanceof SignupError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Couldn't create your account. Try again." }, { status: 500 });
  }
}
