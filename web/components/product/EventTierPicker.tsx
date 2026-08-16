"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";

type Tier = { productId: string; name: string; priceKobo: number; isSoldOut: boolean };

type AccessTier = { productId: string; entitled: boolean; checkInCode: string | null; checkedInAt: string | null };

function formatNaira(kobo: number) {
  if (kobo === 0) return "Get for free";
  return `Buy · ₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function EventTierPicker({ eventId, tiers }: { eventId: string; tiers: Tier[] }) {
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [access, setAccess] = useState<Record<string, AccessTier> | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});

  async function load() {
    const res = await apiFetch(`/api/events/${eventId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setIsOwner(data.isOwner);
    const map: Record<string, AccessTier> = {};
    for (const t of data.tiers as AccessTier[]) map[t.productId] = t;
    setAccess(map);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (!access) return;
    for (const tier of Object.values(access)) {
      if (tier.checkInCode && !qrDataUrls[tier.checkInCode]) {
        QRCode.toDataURL(tier.checkInCode, { margin: 1, width: 200 }).then((url) => {
          setQrDataUrls((cur) => ({ ...cur, [tier.checkInCode as string]: url }));
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access]);

  async function handleBuy(productId: string) {
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    setError(null);
    setBusyProductId(productId);
    try {
      const res = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify({ productId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.free) {
        await load();
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyProductId(null);
    }
  }

  if (isOwner) return null;
  if (!access) return null;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-soft">{error}</p>}
      {tiers.map((tier) => {
        const tierAccess = access[tier.productId];
        if (tierAccess?.entitled) {
          const qr = tierAccess.checkInCode ? qrDataUrls[tierAccess.checkInCode] : null;
          return (
            <div key={tier.productId} className="rounded-lg border border-line bg-surface p-4 flex items-center gap-4">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Ticket QR code" className="h-20 w-20 rounded bg-white p-1 shrink-0" />
              )}
              <div>
                <p className="text-sm font-semibold mb-0.5">{tier.name} ticket</p>
                <p className="text-xs text-red-soft font-semibold">
                  {tierAccess.checkedInAt ? "Checked in" : "Show this QR code at the door"}
                </p>
              </div>
            </div>
          );
        }
        return (
          <button
            key={tier.productId}
            onClick={() => handleBuy(tier.productId)}
            disabled={busyProductId === tier.productId || tier.isSoldOut}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {tier.isSoldOut
              ? `${tier.name} · Sold out`
              : busyProductId === tier.productId
                ? "Starting checkout…"
                : `${tier.name} · ${formatNaira(tier.priceKobo)}`}
          </button>
        );
      })}
    </div>
  );
}
