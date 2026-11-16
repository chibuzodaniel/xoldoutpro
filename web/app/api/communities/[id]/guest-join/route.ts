import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GuestJoinError, startGuestMembership } from "@/lib/communities/guestJoin";

// Guest membership checkout (2026-11-16): no account, no sign-in. The email
// must already be confirmed with the 6-digit code (/api/guest-checkout/*).
const bodySchema = z.object({
  planId: z.string().min(1).max(64),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^\+?[0-9 ()-]{7,20}$/)
    .optional()
    .or(z.literal("")),
  verificationToken: z.string().min(10).max(200),
  gateway: z.enum(["flutterwave", "monnify", "bachs"]).default("bachs"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const msg = field === "phone" ? "That phone number doesn't look right." : field === "email" ? "Enter a valid email address." : field === "name" ? "Enter your full name." : "Check your details and try again.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  try {
    const result = await startGuestMembership({ groupId: id, ...parsed.data, phone: parsed.data.phone || null, origin: req.nextUrl.origin });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GuestJoinError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Couldn't start checkout. Try again." }, { status: 500 });
  }
}
