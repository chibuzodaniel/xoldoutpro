import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { claimGuestMembership, GuestJoinError } from "@/lib/communities/guestJoin";

// Create the account after payment and link the guest membership to it.
const bodySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Za-z]/)
    .regex(/\d/),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use at least 8 characters, with a letter and a number." }, { status: 400 });
  try {
    return NextResponse.json(await claimGuestMembership(parsed.data.token, parsed.data.password));
  } catch (err) {
    if (err instanceof GuestJoinError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Couldn't create your account. Try again." }, { status: 500 });
  }
}
