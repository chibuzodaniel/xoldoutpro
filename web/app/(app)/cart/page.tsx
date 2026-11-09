"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { useToast } from "@/components/ui/ToastProvider";
import { useGatewayCheckout, GatewayPickerCancelled } from "@/lib/useGatewayCheckout";
import { GatewayPickerSheet } from "@/components/checkout/GatewayPickerSheet";
import { useCart, removeFromCart, setCartQuantity } from "@/lib/cart";

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

const input = "rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-red";

// The cart (v2, design/v2-prototype, 2026-11-09): music, beats and merch from
// any artists, paid in one checkout (POST /api/checkout/cart). Prices shown
// here are what was added; checkout re-prices everything and adds any service
// charges, the same way a single purchase does.
export default function CartPage() {
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const items = useCart();
  const [busy, setBusy] = useState(false);
  const { gatewaySheetOpen, pickGateway, handleGatewaySelect, closeGatewaySheet } = useGatewayCheckout();
  const hasMerch = items.some((i) => i.type === "MERCH");
  const [shipping, setShipping] = useState({ recipientName: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "" });
  const subtotal = items.reduce((sum, i) => sum + i.unitPriceKobo * i.quantity, 0);

  async function checkout() {
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    if (hasMerch && (!shipping.recipientName || !shipping.phone || !shipping.addressLine1 || !shipping.city || !shipping.state)) {
      toast.error("Fill in the shipping address for your merch");
      return;
    }
    setBusy(true);
    try {
      const gateway = await pickGateway();
      const res = await apiFetch("/api/checkout/cart", {
        method: "POST",
        body: JSON.stringify({
          gateway,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            variantId: i.variantId,
            licenseId: i.licenseId,
            acceptedLicenseTerms: i.acceptedLicenseTerms,
            payAmountKobo: i.payAmountKobo,
          })),
          shipping: hasMerch ? { ...shipping, addressLine2: shipping.addressLine2 || undefined } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not start checkout");
      // The cart empties once the payment is confirmed (checkout return page).
      router.push(data.checkoutUrl);
    } catch (err) {
      if (err instanceof GatewayPickerCancelled) return;
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-24">
      <BackHeader title="Cart" />
      <div className="mx-auto max-w-2xl px-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="font-serif text-2xl font-bold">Your cart is empty</p>
            <p className="text-sm text-ink-3">Add music, beats or merch and pay for everything at once.</p>
            <Link href="/discover" className="mt-2 rounded-full bg-red px-6 py-3 text-sm font-bold text-white">
              Discover music
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line-soft">
              {items.map((i) => (
                <li key={i.key} className="flex gap-3 py-4">
                  <Link href={i.href} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-red/50 to-black">
                    <FallbackImg src={i.imageUrl} alt={i.title} className="h-full w-full object-cover" fallback={null} />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={i.href} className="block truncate text-[16px] font-bold">
                      {i.title}
                    </Link>
                    <p className="truncate text-[13px] text-ink-3">
                      {i.artistName}
                      {i.variantLabel ? ` · ${i.variantLabel}` : ""}
                      {i.licenseName ? ` · ${i.licenseName} license` : ""}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      {i.type === "MERCH" ? (
                        <div className="flex items-center rounded-full border border-line">
                          <button type="button" onClick={() => setCartQuantity(i.key, i.quantity - 1)} disabled={i.quantity <= 1} className="h-8 w-8 disabled:opacity-30" aria-label="Fewer">
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{i.quantity}</span>
                          <button type="button" onClick={() => setCartQuantity(i.key, i.quantity + 1)} className="h-8 w-8" aria-label="More">
                            +
                          </button>
                        </div>
                      ) : (
                        <span />
                      )}
                      <span className="font-serif text-lg font-bold text-red-soft">{naira(i.unitPriceKobo * i.quantity)}</span>
                    </div>
                    <button type="button" onClick={() => removeFromCart(i.key)} className="mt-1 text-xs font-semibold text-ink-3">
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {hasMerch && (
              <section className="mt-4 flex flex-col gap-2.5">
                <h2 className="font-serif text-xl font-bold">Shipping address</h2>
                <p className="text-xs text-ink-3">For the merch in your cart. Each artist ships their own items.</p>
                <input className={input} placeholder="Recipient name" value={shipping.recipientName} onChange={(e) => setShipping({ ...shipping, recipientName: e.target.value })} />
                <input className={input} placeholder="Phone number" value={shipping.phone} onChange={(e) => setShipping({ ...shipping, phone: e.target.value })} />
                <input className={input} placeholder="Address line 1" value={shipping.addressLine1} onChange={(e) => setShipping({ ...shipping, addressLine1: e.target.value })} />
                <input className={input} placeholder="Address line 2 (optional)" value={shipping.addressLine2} onChange={(e) => setShipping({ ...shipping, addressLine2: e.target.value })} />
                <div className="flex gap-2.5">
                  <input className={`${input} min-w-0 flex-1`} placeholder="City" value={shipping.city} onChange={(e) => setShipping({ ...shipping, city: e.target.value })} />
                  <input className={`${input} min-w-0 flex-1`} placeholder="State" value={shipping.state} onChange={(e) => setShipping({ ...shipping, state: e.target.value })} />
                </div>
              </section>
            )}

            <div className="sticky bottom-0 -mx-4 mt-6 border-t border-line-soft bg-bg/95 px-4 py-4 backdrop-blur">
              <div className="mb-3 flex items-end justify-between">
                <span className="text-sm text-ink-3">
                  Subtotal · {items.length} {items.length === 1 ? "item" : "items"}
                </span>
                <span className="font-serif text-2xl font-bold">{naira(subtotal)}</span>
              </div>
              <p className="mb-3 text-[11px] text-ink-3">Shipping and any service charges are added at checkout. You pay once for everything.</p>
              <button type="button" onClick={checkout} disabled={busy} className="w-full rounded-full bg-red px-5 py-4 text-[16px] font-bold text-white disabled:opacity-50">
                {busy ? "Starting checkout…" : firebaseUser ? "Checkout" : "Sign in to check out"}
              </button>
            </div>
          </>
        )}
      </div>
      <GatewayPickerSheet open={gatewaySheetOpen} onSelect={handleGatewaySelect} onClose={closeGatewaySheet} />
    </div>
  );
}
