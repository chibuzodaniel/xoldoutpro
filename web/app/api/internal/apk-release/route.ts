import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Called by mobile's `npm run publish-apk` script after it builds the
 * Android APK via EAS and uploads the artifact to R2 itself — this route
 * never sees the file bytes, only the resulting metadata. Secret-gated
 * (APK_RELEASE_SECRET) rather than requireSuperModerator/requireUser
 * because the publish script runs from a maintainer's machine with no
 * Firebase session, the same reasoning as CRON_SECRET on sweep-holds.
 *
 * Read by GET /api/mobile/version, which both the web Android-install
 * banner and the mobile app's own in-app update check poll.
 */
const bodySchema = z.object({
  version: z.string().min(1),
  buildNumber: z.number().int().positive(),
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.APK_RELEASE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { version, buildNumber, url } = bodySchema.parse(await req.json());

    const row = await db.platformSettings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        latestApkVersion: version,
        latestApkBuildNumber: buildNumber,
        latestApkUrl: url,
        latestApkReleasedAt: new Date(),
      },
      update: {
        latestApkVersion: version,
        latestApkBuildNumber: buildNumber,
        latestApkUrl: url,
        latestApkReleasedAt: new Date(),
      },
    });

    return NextResponse.json({
      version: row.latestApkVersion,
      buildNumber: row.latestApkBuildNumber,
      url: row.latestApkUrl,
      releasedAt: row.latestApkReleasedAt,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
