"use client";

import { useRef, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";

export type GuestInfo = { name: string; email: string };

// Same shape as GatewayPickerCancelled (lib/useGatewayCheckout.ts) — thrown
// when the sheet is dismissed without submitting, so callers can tell a
// deliberate cancel apart from a real error.
export class GuestInfoCancelled extends Error {
  constructor() {
    super("Checkout cancelled");
  }
}

/**
 * "Do not force a customer to create an account or log in before
 * purchasing" — every purchase component calls pickGuestInfo() in place of
 * redirecting to /login when there's no Firebase session, exactly the way
 * pickGateway() (lib/useGatewayCheckout.ts) is already awaited before every
 * checkout call. Mirrors that hook's promise-settled-by-a-sheet shape on
 * purpose, so the two compose the same way at every call site.
 */
export function useGuestCheckout() {
  const [open, setOpen] = useState(false);
  const settleRef = useRef<{ resolve: (info: GuestInfo) => void; reject: (e: Error) => void } | null>(null);

  function pickGuestInfo(): Promise<GuestInfo> {
    return new Promise((resolve, reject) => {
      settleRef.current = { resolve, reject };
      setOpen(true);
    });
  }

  function handleSubmit(info: GuestInfo) {
    setOpen(false);
    settleRef.current?.resolve(info);
    settleRef.current = null;
  }

  function close() {
    setOpen(false);
    settleRef.current?.reject(new GuestInfoCancelled());
    settleRef.current = null;
  }

  return { guestInfoSheetOpen: open, pickGuestInfo, handleGuestInfoSubmit: handleSubmit, closeGuestInfoSheet: close };
}

/**
 * Signs the browser into the passwordless account a guest checkout just
 * created (POST /api/orders returns this token only the first time a given
 * email checks out) — after this resolves, the guest is a normal
 * authenticated session against that account, same as anyone who actually
 * signed up: AuthProvider's onAuthStateChanged listener picks it up and
 * calls /api/auth/sync itself, same as any other sign-in.
 */
export async function completeGuestSignIn(customToken: string) {
  if (!firebaseAuth) return;
  await signInWithCustomToken(firebaseAuth, customToken);
}
