// Shared between SiteControlsPanel.tsx (the "visible to regular
// moderators" toggle list) and ModerationShell.tsx (per-section nav
// visibility) — a super-moderator-editable map of which panels a
// regular moderator can see (GET/PATCH /api/admin/panel-visibility).
export const PANEL_LABEL: Record<string, string> = {
  finance: "Platform finance",
  stats: "Platform growth",
  visits: "Site visits",
  users: "User directory",
  // New (DECISIONS.md): the moderator-dashboard product-management panel —
  // browse every product, see owner/sales/ambassador attribution, edit,
  // take down for any reason.
  products: "Products",
  ambassadors: "Ambassadors",
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
export const PANEL_KEYS = Object.keys(PANEL_LABEL);
