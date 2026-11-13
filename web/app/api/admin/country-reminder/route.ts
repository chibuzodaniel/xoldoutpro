import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireSuperModerator } from "@/lib/auth/session";
import { runCountryReminder } from "@/lib/profile/countryReminder";

// Super moderators: count (GET) or send (POST { send: true }) the
// "Add your country" reminder (lib/profile/countryReminder.ts).
export async function GET(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    return NextResponse.json(await runCountryReminder({ send: false }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireSuperModerator(req);
    const { send } = z.object({ send: z.literal(true) }).parse(await req.json());
    return NextResponse.json(await runCountryReminder({ send }));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Confirm sending" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not send" }, { status: 500 });
  }
}
