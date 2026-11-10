"use client";

import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";

type Entitlement = {
  product: { title: string; creator: { displayName: string; handle: string } };
  order: {
    createdAt?: string;
    merchFulfillment: {
      status: "TO_SHIP" | "SHIPPED" | "DELIVERED";
      trackingInfo: string | null;
      shippedAt?: string | null;
      recipientName?: string;
      addressLine1?: string;
      addressLine2?: string | null;
      city?: string;
      state?: string;
    } | null;
  };
};

function day(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : null;
}

// "Track order" for a merch purchase (v2, design/v2-prototype): where the
// order is (ordered → shipped → delivered), the seller's tracking info and
// the delivery address. Built from what Library already loaded — no fetch.
export function TrackOrderSheet({ entitlement, onClose }: { entitlement: Entitlement | null; onClose: () => void }) {
  const toast = useToast();
  const f = entitlement?.order.merchFulfillment ?? null;
  const step = f ? { TO_SHIP: 0, SHIPPED: 1, DELIVERED: 2 }[f.status] : 0;
  const steps = [
    { label: "Ordered", sub: day(entitlement?.order.createdAt) ?? "Paid" },
    { label: "Shipped", sub: step >= 1 ? (day(f?.shippedAt) ?? "On its way") : "The seller is preparing it" },
    { label: "Delivered", sub: step >= 2 ? "Arrived" : "Not yet" },
  ];

  return (
    <BottomSheet open={Boolean(entitlement)} onClose={onClose} title="Track order">
      {entitlement && (
        <div className="flex flex-col gap-4 px-5 pb-4">
          <div>
            <p className="font-bold">{entitlement.product.title}</p>
            <p className="text-sm text-ink-3">Sold by {entitlement.product.creator.displayName}</p>
          </div>
          <ol className="flex flex-col">
            {steps.map((s, i) => {
              const done = i <= step;
              return (
                <li key={s.label} className="flex gap-3">
                  <span className="flex flex-col items-center">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${done ? "bg-red text-white" : "border border-line text-ink-3"}`}>
                      {done ? "✓" : i + 1}
                    </span>
                    {i < steps.length - 1 && <span className={`h-8 w-0.5 ${i < step ? "bg-red" : "bg-line"}`} />}
                  </span>
                  <span className="pb-3">
                    <span className={`block text-[15px] font-semibold ${done ? "" : "text-ink-3"}`}>{s.label}</span>
                    <span className="block text-[12px] text-ink-3">{s.sub}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {f?.trackingInfo && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
              <span className="min-w-0">
                <span className="block text-[12px] text-ink-3">Tracking</span>
                <span className="block break-all font-semibold">{f.trackingInfo}</span>
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(f.trackingInfo!).then(() => toast.success("Copied"))}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-bold"
              >
                Copy
              </button>
            </div>
          )}
          {f?.addressLine1 && (
            <div className="rounded-2xl border border-line p-4 text-sm">
              <p className="mb-1 text-[12px] text-ink-3">Delivering to</p>
              <p className="font-semibold">{f.recipientName}</p>
              <p className="text-ink-2">
                {f.addressLine1}
                {f.addressLine2 ? `, ${f.addressLine2}` : ""}
              </p>
              <p className="text-ink-2">
                {f.city}, {f.state}
              </p>
            </div>
          )}
          <Link href={`/u/${entitlement.product.creator.handle}`} onClick={onClose} className="rounded-full border border-line px-4 py-3 text-center text-sm font-bold">
            Contact the seller
          </Link>
        </div>
      )}
    </BottomSheet>
  );
}
