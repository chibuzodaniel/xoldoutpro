"use client";

import { createContext, useContext } from "react";
import type { PanelKey } from "./panelKeys";

// Lets a panel ask whether the current moderator may use a feature inside it
// (userDetails, productTakedown, ambassadorRates — components/moderation/
// panelKeys.ts). ModerationShell provides its own panelVisible(); the
// server enforces the same switches (lib/moderation/panelAccess.ts), so
// this only keeps buttons that would 403 from showing.
const ModeratorAccessContext = createContext<(key: PanelKey) => boolean>(() => true);

export const ModeratorAccessProvider = ModeratorAccessContext.Provider;

export function useCanUse() {
  return useContext(ModeratorAccessContext);
}
