"use client";

import { useRef, useState } from "react";

export type Gateway = "flutterwave" | "monnify" | "bachs";

// Single source of truth for which processors are actually usable right
// now — Flutterwave and Monnify's merchant accounts are still pending
// approval (DECISIONS.md), and their API keys aren't in hand yet either.
// GatewayPickerSheet.tsx derives its visible options from this same array,
// so enabling one later is a one-line change here. While it holds exactly
// one gateway, pickGateway() below skips the sheet entirely and resolves
// straight to it — there's nothing to ask the buyer to choose between.
export const ENABLED_GATEWAYS: Gateway[] = ["bachs"];

// Thrown by pickGateway() when the sheet is dismissed without a selection
// (backdrop tap, close button) — callers check for this specifically so a
// deliberate cancel doesn't surface as a generic "something went wrong".
export class GatewayPickerCancelled extends Error {
  constructor() {
    super("Checkout cancelled");
  }
}

/**
 * Buyer-selectable checkout processor (originally "different options ...
 * flutterwave and monnify"; Bachs added once those two accounts stalled on
 * approval — see ENABLED_GATEWAYS above for which are currently live). Each
 * of the four purchase components (Release/Beat/Merch/Event) awaits
 * pickGateway() before calling POST /api/orders, instead of hardcoding one
 * processor — unaffected by ENABLED_GATEWAYS holding just one entry today,
 * since pickGateway() still resolves (just without showing UI). Free (₦0)
 * orders never call pickGateway at all; there's no processor involved for
 * those.
 */
export function useGatewayCheckout() {
  const [open, setOpen] = useState(false);
  const settleRef = useRef<{ resolve: (g: Gateway) => void; reject: (e: Error) => void } | null>(null);

  function pickGateway(): Promise<Gateway> {
    if (ENABLED_GATEWAYS.length === 1) return Promise.resolve(ENABLED_GATEWAYS[0]);
    return new Promise((resolve, reject) => {
      settleRef.current = { resolve, reject };
      setOpen(true);
    });
  }

  function handleSelect(gateway: Gateway) {
    setOpen(false);
    settleRef.current?.resolve(gateway);
    settleRef.current = null;
  }

  function close() {
    setOpen(false);
    settleRef.current?.reject(new GatewayPickerCancelled());
    settleRef.current = null;
  }

  return { gatewaySheetOpen: open, pickGateway, handleGatewaySelect: handleSelect, closeGatewaySheet: close };
}
