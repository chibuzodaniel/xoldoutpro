import { NextResponse } from "next/server";
import { getSupportAccount } from "@/lib/support/account";

// Public: who the official XOLDOUT account is (for "Message XOLDOUT").
export async function GET() {
  const account = await getSupportAccount();
  return NextResponse.json({ account }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
