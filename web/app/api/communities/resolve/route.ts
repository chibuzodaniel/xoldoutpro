import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// "Have an invite code?" → which community it opens. The code itself is
// then passed to join, where it skips the private-community request step.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code || code.length > 20) return NextResponse.json({ error: "Enter an invite code" }, { status: 400 });
  const group = await db.fanbaseGroup.findUnique({ where: { inviteCode: code }, select: { id: true, name: true } });
  if (!group) return NextResponse.json({ error: "That invite code doesn't match a community" }, { status: 404 });
  return NextResponse.json({ community: group });
}
