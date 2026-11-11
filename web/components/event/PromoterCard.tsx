"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";

// "Become a Promoter" on an event page (explicit ask, 2026-11-11): apply,
// see your status, and once approved get your link, clicks and your % (within
// the host's range). Loaded once on the event page — never polled.

type Program = {
  open: boolean;
  payType: "PERCENT" | "FLAT";
  minPercent: number;
  maxPercent: number;
  flatKobo: number;
  isHost: boolean;
  mine: { id: string; status: "PENDING" | "APPROVED" | "REJECTED"; sharePercent: number; code: string; clickCount: number } | null;
};

const naira = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export function PromoterCard({ eventId }: { eventId: string }) {
  const { appUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [program, setProgram] = useState<Program | null>(null);
  const [open, setOpen] = useState(false);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/events/${eventId}/promoters/program`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Program | null) => {
        if (cancelled || !d) return;
        setProgram(d);
        setPct(d.mine?.sharePercent ?? d.maxPercent);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, appUser?.id]);

  if (!program || program.isHost || (!program.open && program.mine?.status !== "APPROVED")) return null;
  const mine = program.mine;
  const earn = program.payType === "FLAT" ? `earn ${naira(program.flatKobo)} per ticket` : `earn up to ${program.maxPercent}% commission`;
  const link = mine ? `${typeof window !== "undefined" ? window.location.origin : "https://www.xoldout.app"}/e/${eventId}?promo=${mine.code}` : "";

  async function apply() {
    if (!appUser) return router.push(`/login?next=${encodeURIComponent(`/e/${eventId}`)}`);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/promoters/apply`, { method: "POST", body: JSON.stringify(program?.payType === "PERCENT" ? { sharePercent: pct } : {}) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't apply");
      setProgram((p) => (p ? { ...p, mine: d.promoter } : p));
      toast.success("Application sent. The host will review it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function savePct() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/promoters/me`, { method: "PATCH", body: JSON.stringify({ sharePercent: pct }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't save");
      setProgram((p) => (p && p.mine ? { ...p, mine: { ...p.mine, sharePercent: pct } } : p));
      toast.success(`Your commission is now ${pct}% on new sales.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      if (typeof navigator.share === "function") await navigator.share({ url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast.success("Link copied");
      }
    } catch {
      // dismissed
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3.5 text-left">
        <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 text-red-soft" fill="currentColor" aria-hidden>
          <path d="M3 10v4a1 1 0 001 1h2l5 4V5L6 9H4a1 1 0 00-1 1zm13.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">{mine?.status === "APPROVED" ? "Your promoter link" : "Become a Promoter"}</span>
          <span className="block text-[13px] text-ink-3">
            {mine?.status === "APPROVED" ? `${mine.clickCount} clicks · ${program.payType === "FLAT" ? naira(program.flatKobo) + " per ticket" : mine.sharePercent + "% commission"}` : mine?.status === "PENDING" ? "Application sent — waiting for the host" : `Share this event & ${earn}`}
          </span>
        </span>
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-2" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Promote this event" height="half">
        <div className="flex flex-col gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <p className="text-sm text-ink-2">
            {program.payType === "FLAT"
              ? `The host pays ${naira(program.flatKobo)} for every ticket sold through your link.`
              : `The host pays ${program.minPercent}–${program.maxPercent}% of the ticket price (after any discount) for every ticket sold through your link.`}{" "}
            Paid into your XOLDOUT wallet once each sale goes through. Your own purchases don&apos;t count.
          </p>

          {program.payType === "PERCENT" && mine?.status !== "PENDING" && (
            <label className="flex flex-col gap-2">
              <span className="flex justify-between text-sm">
                <span className="text-ink-3">Your commission</span>
                <b>{pct}%</b>
              </span>
              <input type="range" min={program.minPercent} max={program.maxPercent} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="accent-red" />
            </label>
          )}

          {!mine || mine.status === "REJECTED" ? (
            <button type="button" onClick={apply} disabled={busy} className="rounded-full bg-red py-3.5 text-[15px] font-bold text-white disabled:opacity-50">
              {mine?.status === "REJECTED" ? "Apply again" : "Apply to promote"}
            </button>
          ) : mine.status === "PENDING" ? (
            <p className="rounded-xl border border-line p-3 text-center text-sm text-ink-2">Your application is with the host. You&apos;ll be notified when they decide.</p>
          ) : (
            <>
              <div className="rounded-xl border border-line p-3">
                <p className="text-xs text-ink-3">Your link</p>
                <p className="mt-1 break-all text-sm">{link}</p>
                <p className="mt-2 text-xs text-ink-3">{mine.clickCount} clicks so far</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={copyLink} className="flex-1 rounded-full bg-red py-3 text-[15px] font-bold text-white">
                  Share my link
                </button>
                {program.payType === "PERCENT" && pct !== mine.sharePercent && (
                  <button type="button" onClick={savePct} disabled={busy} className="flex-1 rounded-full border border-line py-3 text-[15px] font-semibold disabled:opacity-50">
                    Save {pct}%
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
