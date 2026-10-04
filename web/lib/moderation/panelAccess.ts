import type { NextRequest } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import type { PanelKey } from "@/components/moderation/panelKeys";

// Server half of the moderator view controls (components/moderation/
// panelKeys.ts). Before 2026-10-04 hiding a panel only removed it from the
// menu — a regular moderator could still call its API directly. Every
// moderator route now names the feature it belongs to and goes through this.

export async function canModeratorUse(user: { isSuperModerator: boolean }, key: PanelKey): Promise<boolean> {
  if (user.isSuperModerator) return true;
  const row = await db.moderationPanelVisibility.findUnique({ where: { panelKey: key }, select: { visible: true } });
  return row?.visible ?? true;
}

/** requireModerator, plus 403 when a super-moderator has turned `key` off for regular moderators. */
export async function requireModeratorPanel(req: NextRequest, key: PanelKey) {
  const result = await requireModerator(req);
  if (!(await canModeratorUse(result.user, key))) {
    throw new AuthError("A super moderator has turned this tool off for moderators", 403);
  }
  return result;
}
