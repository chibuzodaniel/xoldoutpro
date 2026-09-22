"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { BackHeader } from "@/components/ui/BackHeader";
import { GrowthChart } from "@/components/moderation/GrowthChart";
import { SiteControlsPanel } from "./SiteControlsPanel";
import { ManageModeratorsPanel } from "./ManageModeratorsPanel";
import { PlatformFinancePanel } from "./PlatformFinancePanel";
import { PlatformStatsPanel } from "./PlatformStatsPanel";
import { UsersListPanel } from "./UsersListPanel";
import { AmbassadorsPanel } from "./AmbassadorsPanel";
import { LegacyAmbassadorRecompute } from "./LegacyAmbassadorRecompute";
import { BillboardsPanel } from "./BillboardsPanel";
import { VerifyCreatorPanel } from "./VerifyCreatorPanel";
import { RestoreAccountPanel } from "./RestoreAccountPanel";
import { EventPromotersModPanel } from "./EventPromotersModPanel";
import { VerifyGroupPanel } from "./VerifyGroupPanel";
import { VerificationQueuePanel } from "./VerificationQueuePanel";
import { ReportsQueuePanel } from "./ReportsQueuePanel";
import { ProductsPanel } from "./ProductsPanel";
import { EventCommissionRecompute } from "./EventCommissionRecompute";

type NavItem = {
  id: string;
  label: string;
  icon: string;
  // Matches a PANEL_KEYS entry — gated through panelVisible(), same as
  // every panel always was. Absent for items that were never gated this
  // way (Reports) or that use the separate super-moderator-only gate below.
  panelKey?: string;
  superOnly?: boolean;
  render: () => ReactNode;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

// Rebuilt dashboard (DECISIONS.md): grouped sidebar nav replacing the old
// single 2559-line scroll-everything page — every panel that page had is
// still here, just relocated and split into its own file
// (components/moderation/*.tsx), plus the new Products panel. Structure
// reference was an external ERP screenshot (grouped sections, icon+label
// rows); colors/typography are XOLDOUT's own throughout, not copied from it.
export function ModerationShell() {
  const { appUser } = useAuth();
  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Explicit ask, 2026-09-22: land on Platform growth, not Reports.
  const [activeId, setActiveId] = useState("stats");

  useEffect(() => {
    async function loadVisibility() {
      const res = await apiFetch("/api/admin/panel-visibility");
      if (!res.ok) return;
      const data: { visibility: Record<string, boolean> } = await res.json();
      setPanelVisibility(data.visibility);
    }
    loadVisibility();
  }, []);

  // Same "super-mods see everything" precedent ManageModeratorsPanel always
  // had — unconditional bypass, not just a default-true fallback.
  function panelVisible(key: string): boolean {
    if (appUser?.isSuperModerator) return true;
    if (panelVisibility === null) return false;
    return panelVisibility[key] ?? true;
  }

  const groups: NavGroup[] = [
    {
      id: "overview",
      label: "Overview",
      items: [
        { id: "reports", label: "Reports", icon: "🚩", render: () => <ReportsQueuePanel /> },
        { id: "finance", label: "Platform finance", icon: "💰", panelKey: "finance", render: () => <PlatformFinancePanel /> },
        {
          id: "stats",
          label: "Platform growth",
          icon: "📈",
          panelKey: "stats",
          render: () => (
            <>
              <PlatformStatsPanel />
              <GrowthChart />
            </>
          ),
        },
      ],
    },
    {
      id: "commerce",
      label: "Commerce",
      items: [
        { id: "products", label: "Products", icon: "🎵", panelKey: "products", render: () => <ProductsPanel /> },
        { id: "billboards", label: "Billboards", icon: "🖼️", panelKey: "billboards", render: () => <BillboardsPanel /> },
        { id: "eventPromoters", label: "Ticket promoters", icon: "🎟️", panelKey: "eventPromoters", render: () => <EventPromotersModPanel /> },
        { id: "ambassadors", label: "Ambassadors", icon: "🤝", panelKey: "ambassadors", render: () => <AmbassadorsPanel /> },
        {
          // Explicit ask, 2026-09-22: both recompute tools write real,
          // hard-to-reverse ledger corrections — hardcoded super-mod-only
          // (same gate SiteControlsPanel/ManageModeratorsPanel use), not
          // toggle-dependent like every other panel here.
          id: "ambassadorRecompute",
          label: "Legacy ambassador recompute",
          icon: "🧮",
          superOnly: true,
          render: () => <LegacyAmbassadorRecompute />,
        },
        {
          id: "eventCommissionRecompute",
          label: "Event commission recompute",
          icon: "🎫",
          superOnly: true,
          render: () => <EventCommissionRecompute />,
        },
      ],
    },
    {
      id: "community",
      label: "Community",
      items: [
        { id: "users", label: "User directory", icon: "👥", panelKey: "users", render: () => <UsersListPanel /> },
        { id: "verificationQueue", label: "Verification queue", icon: "✅", panelKey: "verificationQueue", render: () => <VerificationQueuePanel /> },
        { id: "verifyCreator", label: "Verify creator (legacy)", icon: "🎤", panelKey: "verifyCreator", render: () => <VerifyCreatorPanel /> },
        { id: "verifyGroup", label: "Verify group (legacy)", icon: "💬", panelKey: "verifyGroup", render: () => <VerifyGroupPanel /> },
        { id: "restoreAccount", label: "Restore account", icon: "♻️", panelKey: "restoreAccount", render: () => <RestoreAccountPanel /> },
      ],
    },
    {
      id: "platform",
      label: "Platform",
      items: [
        {
          id: "siteControls",
          label: "Site controls",
          icon: "⚙️",
          superOnly: true,
          render: () => <SiteControlsPanel panelVisibility={panelVisibility} onVisibilityChange={setPanelVisibility} />,
        },
        { id: "moderators", label: "Manage moderators", icon: "🛡️", superOnly: true, render: () => <ManageModeratorsPanel /> },
      ],
    },
  ];

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((item) => (item.superOnly ? appUser?.isSuperModerator : item.panelKey ? panelVisible(item.panelKey) : true)) }))
    .filter((g) => g.items.length > 0);

  const activeItem = visibleGroups.flatMap((g) => g.items).find((item) => item.id === activeId) ?? visibleGroups[0]?.items[0];

  // Shared between the persistent desktop sidebar and the mobile drawer —
  // same nav list, just two different containers around it (explicit ask,
  // 2026-09-22: the sidebar stays permanently visible on desktop instead of
  // being a drawer there too).
  const navContent = (
    <>
      <p className="font-serif text-lg mb-1">XOLDOUT</p>
      <p className="text-xs text-ink-3 mb-6">Moderation dashboard</p>

      {visibleGroups.map((group) => (
        <div key={group.id} className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-2">{group.label}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveId(item.id);
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors duration-150 ${
                  activeItem?.id === item.id ? "bg-red/15 text-red-soft" : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-6 pt-4 border-t border-line-soft">
        <p className="text-xs font-semibold text-ink">{appUser?.displayName}</p>
        <p className="text-[11px] text-ink-3">{appUser?.email}</p>
      </div>
    </>
  );

  return (
    <div className="flex h-full">
      {/* Persistent desktop sidebar — always visible from md: up, part of the
          normal flex layout (no overlay, no backdrop, no open/close state). */}
      <aside className="hidden md:flex md:w-72 md:shrink-0 md:flex-col md:overflow-y-auto md:border-r md:border-line-soft md:bg-surface md:px-4 md:py-6">
        {navContent}
      </aside>

      <div className="flex flex-1 min-w-0 flex-col h-full">
        <BackHeader
          title="Moderation"
          action={
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              className="text-xl text-ink-2 px-2 md:hidden"
            >
              ☰
            </button>
          }
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-10">
          {activeItem ? (
            <>
              <h2 className="font-serif text-xl mb-1">{activeItem.label}</h2>
              <div className="mt-4">{activeItem.render()}</div>
            </>
          ) : (
            <p className="text-sm text-ink-3">Nothing to show yet.</p>
          )}
        </div>
      </div>

      {/* Mobile-only drawer — same backdrop/transition convention every
          other sheet in this app uses (GatewayPickerSheet, PublishSheet,
          etc.), sliding from the left instead of up from the bottom. Never
          shown at md: and up, since the sidebar above is already visible. */}
      <div
        className={`md:hidden fixed inset-0 z-50 flex transition-colors duration-300 ${
          sidebarOpen ? "bg-black/60" : "pointer-events-none bg-black/0"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      >
        <div
          className={`relative h-full w-72 max-w-[80vw] overflow-y-auto border-r border-line-soft bg-surface px-4 py-6 transition-transform duration-300 ease-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {navContent}
        </div>
      </div>
    </div>
  );
}
