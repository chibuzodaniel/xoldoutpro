// Shared between SiteControlsPanel.tsx (the "visible to regular
// moderators" toggle list), ModerationShell.tsx (per-section nav
// visibility), the per-feature checks inside panels (access.tsx), and the
// server (lib/moderation/panelAccess.ts — every moderator API route checks
// its key, so hiding something blocks it, not just its menu entry). A
// super-moderator-editable map of what a *regular* moderator can see and do
// (GET/PATCH /api/admin/panel-visibility). Super-moderators always see
// everything.
//
// Explicit ask, 2026-10-04: "check all the moderators features and add them
// to moderator view controls so super moderators can hide and unhide them
// from other moderators" — Reports joined the list, and features inside a
// panel that can do real damage on their own got their own switch
// (userDetails, productTakedown, ambassadorRates).
export const PANEL_LABEL: Record<string, string> = {
  reports: "Reports queue",
  finance: "Platform finance",
  stats: "Platform growth",
  visits: "Site visits",
  users: "User directory",
  userDetails: "User money & activity details",
  // New (DECISIONS.md): the moderator-dashboard product-management panel —
  // browse every product, see owner/sales/ambassador attribution, edit,
  // take down for any reason.
  products: "Products",
  productTakedown: "Take down products (from Products or Reports)",
  ambassadors: "Ambassadors",
  ambassadorRates: "Edit ambassador commission rates",
  // ambassadorRecompute/eventCommissionRecompute are NOT here (explicit
  // ask, 2026-09-22) — both write real ledger corrections, so they're
  // hardcoded super-mod-only in ModerationShell.tsx, same as Site
  // controls/Manage moderators, not part of the regular-moderator toggle.
  eventPromoters: "Ticket promoters",
  billboards: "Billboards",
  verifyCreator: "Verify creator",
  verifyGroup: "Verify group",
  verificationQueue: "Verification queue",
  restoreAccount: "Restore account",
  restoreEvent: "Restore event",
};
export const PANEL_KEYS = Object.keys(PANEL_LABEL) as [string, ...string[]];
export type PanelKey = keyof typeof PANEL_LABEL;
