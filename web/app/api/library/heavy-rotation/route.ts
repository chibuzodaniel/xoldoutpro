import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getHeavyRotation } from "@/lib/library/heavyRotation";

const LIMIT = 30;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const products = await getHeavyRotation(user.id, LIMIT);
    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
