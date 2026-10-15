import type { DownloadKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Records that a buyer downloaded a product (see the ProductDownload model).
 * Fire-and-forget like the TrackPlay log in the audio-url routes — a
 * logging failure must never break the download itself.
 */
export function recordDownload(userId: string, productId: string, kind: DownloadKind) {
  db.productDownload
    .upsert({
      where: { userId_productId_kind: { userId, productId, kind } },
      create: { userId, productId, kind },
      update: { count: { increment: 1 }, lastAt: new Date() },
    })
    .catch((err) => console.error("productDownload log failed", err));
}
