"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  useGatewayCheckout,
  GatewayPickerCancelled,
} from "@/lib/useGatewayCheckout";
import {
  useGuestCheckout,
  GuestInfoCancelled,
  rememberGuestOrder,
  type GuestInfo,
} from "@/lib/useGuestCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { GuestInfoSheet } from "@/components/checkout/GuestInfoSheet";
import { ChargeNote } from "@/components/currency/CurrencyProvider";
import { useToast } from "@/components/ui/ToastProvider";
import {
  TipAmountPicker,
  nairaTextToKobo,
} from "@/components/product/TipAmountPicker";
import { MIN_TIP_KOBO } from "@/lib/commerce/constants";

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/**
 * Standalone tip (explicit ask, 2026-11-07): a fan can tip an artist without
 * buying anything — from a release page (`productId`) or straight from the
 * artist's profile (`creatorId`). Opens a bottom sheet with the amount
 * picker; `?tip=1` in the URL opens it straight away (the mobile app's
 * "Tip on xoldout.app" links). Hidden for the artist themselves.
 */
export function TipButton({
  productId,
  creatorId,
  artistName,
  className = "rounded-lg border border-line px-4 py-1.5 text-xs font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink",
  label = "Tip",
}: {
  productId?: string;
  creatorId: string;
  artistName: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser, appUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [tipNaira, setTipNaira] = useState("");
  const [busy, setBusy] = useState(false);
  // The sheets render into <body> (portal): the Tip button often sits inside
  // a pinned/blurred bar, and a parent with backdrop-filter or transform
  // would otherwise trap these full-screen sheets inside it.
  const [mounted, setMounted] = useState(false);
  const {
    gatewaySheetOpen,
    pickGateway,
    handleGatewaySelect,
    closeGatewaySheet,
  } = useGatewayCheckout();
  const {
    guestInfoSheetOpen,
    pickGuestInfo,
    handleGuestInfoSubmit,
    closeGuestInfoSheet,
  } = useGuestCheckout();
  const tipKobo = nairaTextToKobo(tipNaira);

  // Read after mount so server and client HTML match: ?tip=1 opens the sheet,
  // and the portal target (document.body) only exists in the browser.
  /* eslint-disable react-hooks/set-state-in-effect -- one-time mount setup */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tip") === "1") setOpen(true);
    setMounted(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (appUser?.id === creatorId) return null;

  async function send() {
    if (tipKobo < MIN_TIP_KOBO) {
      toast.error(`The smallest tip is ${naira(MIN_TIP_KOBO)}`);
      return;
    }
    setBusy(true);
    try {
      const guest: GuestInfo | undefined = firebaseUser
        ? undefined
        : await pickGuestInfo();
      const gateway = await pickGateway();
      const res = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify(
          productId
            ? { productId, guest, gateway, tipOnly: true, tipKobo }
            : {
                tipCreatorId: creatorId,
                guest,
                gateway,
                tipOnly: true,
                tipKobo,
              },
        ),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Could not start checkout",
        );
      rememberGuestOrder(data.orderId, data.guestOrderToken);
      router.push(data.checkoutUrl);
    } catch (err) {
      if (
        err instanceof GatewayPickerCancelled ||
        err instanceof GuestInfoCancelled
      )
        return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>

      {mounted &&
        createPortal(
          <>
            <div
              className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${open ? "bg-black/60" : "pointer-events-none bg-black/0"}`}
              onClick={() => setOpen(false)}
              aria-hidden={!open}
            >
              <div
                className={`relative w-full max-w-lg mx-auto rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 text-left transition-transform duration-300 ease-out ${
                  open ? "translate-y-0" : "translate-y-full"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="font-serif text-xl mb-1">Tip {artistName}</h2>
                <p className="text-sm text-ink-3 mb-4">
                  Send {artistName} some love. No purchase needed.
                </p>
                <TipAmountPicker valueNaira={tipNaira} onChange={setTipNaira} />
                <ChargeNote kobo={tipKobo} className="mt-2" />
                <button
                  type="button"
                  onClick={send}
                  disabled={busy || tipKobo === 0}
                  className="mt-4 w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy
                    ? "Starting checkout…"
                    : tipKobo > 0
                      ? `Send ${naira(tipKobo)} tip`
                      : "Send tip"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-3 w-full text-xs font-semibold text-ink-3"
                >
                  Cancel
                </button>
              </div>
            </div>

            <GatewayPickerSheet
              open={gatewaySheetOpen}
              onSelect={handleGatewaySelect}
              onClose={closeGatewaySheet}
            />
            <GuestInfoSheet
              open={guestInfoSheetOpen}
              onSubmit={handleGuestInfoSubmit}
              onClose={closeGuestInfoSheet}
            />
          </>,
          document.body,
        )}
    </>
  );
}
