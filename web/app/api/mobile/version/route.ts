import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Public — no auth. Polled by the web Android-install banner and by the
 * mobile app's own in-app update check, both of which need this before a
 * user is necessarily signed in. Written by POST /api/internal/apk-release.
 */
export async function GET() {
  const row = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({
    version: row?.latestApkVersion ?? null,
    buildNumber: row?.latestApkBuildNumber ?? null,
    url: row?.latestApkUrl ?? null,
    releasedAt: row?.latestApkReleasedAt ?? null,
  });
}
