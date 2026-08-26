"use client";

import { useRef, useState } from "react";

export type Gateway = "flutterwave" | "monnify";

// Thrown by pickGateway() when the sheet is dismissed without a selection
// (backdrop tap, close button) — callers check for this specifically so a
// deliberate cancel doesn't surface as a generic "something went wrong".
export class GatewayPickerCancelled extends Error {
  constructor() {
    super("Checkout cancelled");
  }
}

/**
 * Buyer-selectable checkout processor (explicit ask: "different options ...
 * flutterwave and monnify"). Each of the four purchase components
 * (Release/Beat/Merch/Event) awaits pickGateway() before calling
 * POST /api/orders, instead of hardcoding Flutterwave. Free (₦0) orders
 * never call pickGateway at all; there's no processor involved for those.
 */
export function useGatewayCheckout() {
  const [open, setOpen] = useState(false);
  const settleRef = useRef<{ resolve: (g: Gateway) => void; reject: (e: Error) => void } | null>(null);

  function pickGateway(): Promise<Gateway> {
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
