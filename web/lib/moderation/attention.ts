import { after } from "next/server";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push/send";

// Real-time moderator alerts (explicit ask: "moderators should receive real
// time notification of anything that needs attention in the moderator
// board"). Two halves:
//  - notifyModerators(): the moment something lands in a queue, every
//    moderator who can see that panel gets a bell notification + a push to
//    their devices, deep-linking to the panel (/moderation?panel=<id>).
//  - getAttentionCounts(): live per-panel counts of what's still waiting,
//    polled by ModerationShell for the nav badges.

/** ModerationShell nav ids that can need attention. */
export type AttentionPanel = "reports" | "verificationQueue" | "billboards" | "finance";

// Which panel-visibility key gates each panel (components/moderation/
// panelKeys.ts). Reports has none — every moderator always sees it.
const PANEL_VISIBILITY_KEY: Record<AttentionPanel, string | null> = {
  reports: null,
  verificationQueue: "verificationQueue",
  billboards: "billboards",
  finance: "finance",
};

/**
 * Bell + push to every active moderator allowed to see `panel`. Super-mods
 * always qualify (they see every panel); a regular moderator is skipped
 * when a super-mod has hidden that panel from regular moderators.
 * Best-effort: never throws — a notification failure must not fail the
 * report/payment/submission that triggered it.
 */
export async function notifyModerators(args: { panel: AttentionPanel; title: string; body: string }): Promise<void> {
  try {
    const visibilityKey = PANEL_VISIBILITY_KEY[args.panel];
    const hiddenFromRegularMods = visibilityKey
      ? (await db.moderationPanelVisibility.findUnique({ where: { panelKey: visibilityKey } }))?.visible === false
      : false;

    const moderators = await db.user.findMany({
      where: {
        deletedAt: null,
        OR: hiddenFromRegularMods ? [{ isSuperModerator: true }] : [{ isModerator: true }, { isSuperModerator: true }],
      },
      select: { id: true },
    });
    if (moderators.length === 0) return;

    const url = `/moderation?panel=${args.panel}`;
    await db.notification.createMany({
      data: moderators.map((m) => ({ userId: m.id, kind: "MODERATION" as const, title: args.title, body: args.body, url })),
    });
    await Promise.all(moderators.map((m) => sendPushToUser(m.id, { title: args.title, body: args.body, url }).catch(() => {})));
  } catch (err) {
    console.error("notifyModerators failed", err);
  }
}

export type AttentionCounts = Record<AttentionPanel, number>;

/** What's still waiting in each queue right now — the moderator nav badges. */
export async function getAttentionCounts(): Promise<AttentionCounts> {
  const [reports, verificationQueue, billboards, finance] = await Promise.all([
    db.report.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.verificationApplication.count({ where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } } }),
    db.billboard.count({ where: { status: "PENDING_REVIEW" } }),
    db.payout.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } } }),
  ]);
  return { reports, verificationQueue, billboards, finance };
}

/**
 * The call sites' entry point: sends the alert after the triggering
 * request's response has gone out (next/server's after()), so the reporter /
 * paying creator / submitter never waits on moderator fan-out, while Vercel
 * still keeps the function alive until it's sent — a bare un-awaited promise
 * would be frozen mid-flight (the peak-viewers bug). Falls back to a plain
 * background call outside a request scope (scripts, tests).
 */
export function alertModerators(args: { panel: AttentionPanel; title: string; body: string }): void {
  try {
    after(() => notifyModerators(args));
  } catch {
    void notifyModerators(args);
  }
}
