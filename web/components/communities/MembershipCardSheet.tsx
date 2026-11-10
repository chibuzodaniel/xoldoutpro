"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { useToast } from "@/components/ui/ToastProvider";

type Card = {
  cardCode: string;
  community: { id: string; name: string; logoUrl: string | null };
  member: { displayName: string; avatarUrl: string | null };
  plan: string;
  recurring: boolean;
  state: "active" | "expired" | "suspended";
  expiresAt: string | null;
  autoRenew: boolean;
  issuedAt: string;
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

const STATE = {
  active: { label: "ACTIVE", cls: "border-green text-green" },
  expired: { label: "EXPIRED", cls: "border-red-soft text-red-soft" },
  suspended: { label: "SUSPENDED", cls: "border-red-soft text-red-soft" },
} as const;

function CardFace({ card, qr }: { card: Card; qr: string | null }) {
  const s = STATE[card.state];
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/15 bg-gradient-to-br from-[#2a2a2a] via-[#111] to-black p-5 text-white shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red/50 to-black">
          <FallbackImg src={card.community.logoUrl} alt="" className="h-full w-full object-cover" fallback={null} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-extrabold uppercase tracking-wide">{card.community.name}</span>
          <span className="block truncate text-[12px] uppercase text-white/70">{card.plan}</span>
        </span>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${s.cls}`}>{s.label}</span>
      </div>
      <div className="mt-5 flex items-end gap-3">
        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 border-white/30 bg-surface-2">
          <FallbackImg src={card.member.avatarUrl} alt="" className="h-full w-full object-cover" fallback={null} />
        </span>
        <span className="min-w-0 flex-1 text-[11px] uppercase leading-relaxed text-white/70">
          <span className="block truncate">
            Member: <b className="text-white">{card.member.displayName}</b>
          </span>
          <span className="block truncate">
            Membership ID: <b className="text-white">{card.cardCode}</b>
          </span>
          <span className="block truncate">
            Plan: <b className="text-white">{card.plan}</b>
          </span>
          <span className="block truncate">
            Valid until: <b className="text-white">{card.expiresAt ? day(card.expiresAt) : "No expiry"}</b>
          </span>
          <span className="block truncate">Issued {day(card.issuedAt)}</span>
        </span>
        <span className="h-24 w-24 shrink-0 rounded-xl bg-white p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="Membership QR code" className="h-full w-full" />}
        </span>
      </div>
    </div>
  );
}

// Membership card (v2, design/v2-prototype). The QR holds the card code; an
// organizer's scan checks it against XOLDOUT's records, so a copy or
// screenshot can't outlive the membership.
export function MembershipCardSheet({ open, onClose, communityId }: { open: boolean; onClose: () => void; communityId: string }) {
  const toast = useToast();
  const [card, setCard] = useState<Card | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!open || card) return;
    let cancelled = false;
    apiFetch(`/api/communities/${communityId}/card`)
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't load your card");
        if (cancelled) return;
        setCard(d.card);
        setQr(await QRCode.toDataURL(d.card.cardCode, { margin: 1, width: 512 }));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load your card"));
    return () => {
      cancelled = true;
    };
  }, [open, card, communityId]);

  async function share() {
    if (!card) return;
    const text = `I'm a ${card.plan} member of ${card.community.name} on XOLDOUT.`;
    const url = `${window.location.origin}/groups/${card.community.id}`;
    try {
      if (navigator.share) await navigator.share({ title: card.community.name, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success("Copied");
      }
    } catch {
      // dismissed
    }
  }

  const row = (k: string, v: string) => (
    <div className="flex justify-between py-1.5 text-[14px]">
      <span className="text-ink-3">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Membership card">
        <div className="flex flex-col gap-4 px-5 pb-4">
          {error ? (
            <p className="py-6 text-center text-sm text-ink-3">{error}</p>
          ) : !card ? (
            <p className="py-6 text-center text-sm text-ink-3">Loading your card…</p>
          ) : (
            <>
              <CardFace card={card} qr={qr} />
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setFull(true)} className="rounded-full border border-line px-4 py-3.5 text-[15px] font-bold">
                  Full screen
                </button>
                <button type="button" onClick={share} className="rounded-full border border-line px-4 py-3.5 text-[15px] font-bold">
                  Share preview
                </button>
              </div>
              <div className="rounded-2xl border border-line px-4 py-2">
                {row("Status", STATE[card.state].label)}
                {row("Plan", card.plan)}
                {row("Validity", card.expiresAt ? `Until ${day(card.expiresAt)}` : "No expiry")}
                {row("Auto-renew", card.recurring ? (card.autoRenew ? "On" : "Off") : "Not applicable")}
              </div>
              <p className="text-[12px] text-ink-3">
                Status and expiry come from XOLDOUT&apos;s records and can&apos;t be edited. A copied or screenshotted card is always checked against them when
                scanned.
              </p>
            </>
          )}
        </div>
      </BottomSheet>
      {full &&
        card &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-black px-5" role="dialog" aria-label="Membership card full screen">
            <div className="w-full max-w-md">
              <CardFace card={card} qr={qr} />
            </div>
            <button type="button" onClick={() => setFull(false)} className="rounded-full border border-line px-8 py-3.5 font-bold text-white">
              Close
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
