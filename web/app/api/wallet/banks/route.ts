import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getNigerianBanks } from "@/lib/bachs";

let cache: { banks: { code: string; name: string }[]; fetchedAt: number } | null = null;
const CACHE_MS = 60 * 60 * 1000; // bank list changes essentially never

export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
      return NextResponse.json({ banks: cache.banks });
    }
    const banks = await getNigerianBanks();
    cache = { banks, fetchedAt: Date.now() };
    return NextResponse.json({ banks });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Could not load banks" }, { status: 502 });
  }
}
