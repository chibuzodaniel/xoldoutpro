"use client";

import { useRef, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";

// verificationToken: proof the buyer typed in the code emailed to `email`
// (GuestInfoSheet's second step) — POST /api/orders rejects a guest order
// without it.
export type GuestInfo = { name: string; email: string; verificationToken: string };

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
// A paid guest checkout by a brand-new email has no account to sign into
// yet (it only becomes real once payment succeeds — User.pendingGuestAt), so
// POST /api/orders hands back guestOrderToken instead. It's kept in
// localStorage (the processor's page may come back in another tab) until
// /checkout/callback uses it to fetch the order and, once PAID, sign in.
const GUEST_ORDER_KEY = (orderId: string) => `xoldout-guest-order:${orderId}`;

export function rememberGuestOrder(orderId: string, token: string | null | undefined) {
  if (!token) return;
  try {
    localStorage.setItem(GUEST_ORDER_KEY(orderId), token);
  } catch {
    // storage blocked — the buyer can still sign in from the setup email
  }
}

export function guestOrderToken(orderId: string): string | null {
  try {
    return localStorage.getItem(GUEST_ORDER_KEY(orderId));
  } catch {
    return null;
  }
}

export function forgetGuestOrder(orderId: string) {
  try {
    localStorage.removeItem(GUEST_ORDER_KEY(orderId));
  } catch {
    // ignore
  }
}

export async function completeGuestSignIn(customToken: string) {
  if (!firebaseAuth) return;
  await signInWithCustomToken(firebaseAuth, customToken);
}
