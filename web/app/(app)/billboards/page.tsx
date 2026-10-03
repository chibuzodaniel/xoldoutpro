"use client";

import { useEffect, useState } from "react";
import { BackHeader } from "@/components/ui/BackHeader";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ImageCropModal } from "@/components/upload/ImageCropModal";

// Matches components/discover/BillboardRail.tsx's aspect-[4/5] display —
// cropping to the same ratio here means what a creator frames is exactly
// what shows on Discover, not a server-side center-crop guess.
const BILLBOARD_ASPECT = 4 / 5;
const BILLBOARD_OUTPUT_WIDTH = 1024;
const BILLBOARD_OUTPUT_HEIGHT = 1280;

type BillboardStatus = "PENDING_PAYMENT" | "PENDING_REVIEW" | "ACTIVE" | "REJECTED" | "REMOVED";

type Billboard = {
  id: string;
  status: BillboardStatus;
  artworkUrl: string;
  days: number;
  paidKobo: number;
  expiresAt: string | null;
  rejectionReason: string | null;
  productId: string | null;
  eventId: string | null;
  viewCount: number;
};

type PromotableItem = { kind: "RELEASE" | "BEAT" | "MERCH" | "EVENT"; id: string; title: string };

const KIND_LABEL: Record<PromotableItem["kind"], string> = { RELEASE: "Song", BEAT: "Beat", MERCH: "Merch", EVENT: "Event" };

// "KIND:id" — one <select> value per item; "" = link to my profile.
function itemValue(item: { kind: string; id: string } | null) {
  return item ? `${item.kind}:${item.id}` : "";
}

function parseItemValue(value: string): { kind: PromotableItem["kind"]; id: string } | null {
  if (!value) return null;
  const [kind, id] = value.split(":");
  return { kind: kind as PromotableItem["kind"], id };
}

function PromotePicker({ items, value, onChange, disabled }: { items: PromotableItem[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-red disabled:opacity-50"
    >
      <option value="">My profile</option>
      {(["RELEASE", "BEAT", "MERCH", "EVENT"] as const).map((kind) => {
        const group = items.filter((i) => i.kind === kind);
        if (group.length === 0) return null;
        return (
          <optgroup key={kind} label={`${KIND_LABEL[kind]}s`}>
            {group.map((i) => (
              <option key={i.id} value={itemValue(i)}>
                {i.title}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

type MeResponse = { billboard: Billboard | null; dailyRateKobo: number; minDays: number; maxDays: number };

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const STATUS_LABEL: Record<BillboardStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PENDING_REVIEW: "Awaiting moderator review",
  ACTIVE: "Live",
  REJECTED: "Rejected",
  REMOVED: "Removed",
};

export default function BillboardsPage() {
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [promotable, setPromotable] = useState<PromotableItem[]>([]);
  const [promoteValue, setPromoteValue] = useState("");
  const [savingPromote, setSavingPromote] = useState(false);

  async function load() {
    const res = await apiFetch("/api/billboards");
    if (!res.ok) return;
    const data = (await res.json()) as MeResponse;
    setMe(data);
    setDays((d) => Math.min(Math.max(d, data.minDays), data.maxDays));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    apiFetch("/api/billboards/promotable")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setPromotable(data.items));
  }, []);

  // Change what the current billboard links to (PATCH /api/billboards/[id]).
  async function handleChangePromoted(value: string) {
    if (!me?.billboard) return;
    setSavingPromote(true);
    try {
      const res = await apiFetch(`/api/billboards/${me.billboard.id}`, { method: "PATCH", body: JSON.stringify({ promoted: parseItemValue(value) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update your billboard");
      toast.success(value ? "Billboard now links to your pick" : "Billboard now links to your profile");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSavingPromote(false);
    }
  }

  function handlePickFile(f: File | null) {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function handleSubmit() {
    if (!file || !me) return;
    setBusy(true);
    try {
      const key = await uploadImage(file, "billboard");
      const res = await apiFetch("/api/billboards", { method: "POST", body: JSON.stringify({ key, days, promoted: parseItemValue(promoteValue) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not start your billboard");

      if (data.mode === "bachs" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast.success("Paid — your billboard is awaiting moderator review.");
      handlePickFile(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <div className="pb-10">
        <BackHeader title="Billboards" />
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  const blocking = me.billboard && me.billboard.status !== "REJECTED" && me.billboard.status !== "REMOVED";

  return (
    <div className="pb-10 px-4">
      <BackHeader title="Billboards" />

      <p className="text-sm text-ink-2 mb-4">
        Put your artwork in the rotating billboard rail on Discover. {formatNaira(me.dailyRateKobo)}/day, paid from your wallet or,
        if your balance is short, via Bachs. Every billboard is reviewed by a moderator before it goes live.
      </p>

      {me.billboard && (
        <div className="rounded-lg border border-line p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wide text-red-soft">{STATUS_LABEL[me.billboard.status]}</span>
            <span className="text-xs text-ink-3">
              {me.billboard.days} day{me.billboard.days === 1 ? "" : "s"} · {formatNaira(me.billboard.paidKobo)}
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote R2 artwork, not a local/optimized asset */}
          <img src={me.billboard.artworkUrl} alt="Your billboard" className="w-full rounded-lg mb-3 object-cover" />
          {me.billboard.status === "ACTIVE" && me.billboard.expiresAt && (
            <p className="text-xs text-ink-3">Live until {formatDate(me.billboard.expiresAt)}.</p>
          )}
          {(me.billboard.status === "ACTIVE" || me.billboard.viewCount > 0) && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-ink-3" aria-hidden>
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {me.billboard.viewCount.toLocaleString("en-NG")} view{me.billboard.viewCount === 1 ? "" : "s"}
              <span className="text-xs font-normal text-ink-3">· every time it&apos;s shown</span>
            </p>
          )}
          {blocking && (
            <div className="mt-3">
              <p className="text-xs text-ink-3 mb-1.5">Tapping it opens</p>
              <PromotePicker
                items={promotable}
                value={itemValue(
                  me.billboard.eventId
                    ? { kind: "EVENT", id: me.billboard.eventId }
                    : me.billboard.productId
                      ? promotable.find((i) => i.id === me.billboard!.productId) ?? null
                      : null,
                )}
                onChange={handleChangePromoted}
                disabled={savingPromote}
              />
            </div>
          )}
          {me.billboard.status === "PENDING_REVIEW" && (
            <p className="text-xs text-ink-3">A moderator will approve or reject this soon — you&apos;ll keep this page updated.</p>
          )}
          {me.billboard.status === "REJECTED" && (
            <p className="text-xs text-ink-2">
              Not approved{me.billboard.rejectionReason ? `: ${me.billboard.rejectionReason}` : "."} You&apos;ve been refunded in full.
              You can submit a new one below.
            </p>
          )}
        </div>
      )}

      {!blocking && (
        <div className="rounded-lg border border-line p-4">
          <p className="text-xs text-ink-3 mb-2">Artwork</p>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not a remote/optimized asset
            <img src={preview} alt="Preview" className="w-full rounded-lg mb-3 object-cover" />
          ) : null}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) setCropFile(picked);
              e.target.value = "";
            }}
            className="mb-4 text-sm"
          />
          {cropFile && (
            <ImageCropModal
              file={cropFile}
              aspect={BILLBOARD_ASPECT}
              outputWidth={BILLBOARD_OUTPUT_WIDTH}
              outputHeight={BILLBOARD_OUTPUT_HEIGHT}
              onCancel={() => setCropFile(null)}
              onConfirm={(cropped) => {
                setCropFile(null);
                handlePickFile(cropped);
              }}
            />
          )}

          <p className="text-xs text-ink-3 mb-2">Promote (optional) — what tapping your billboard opens</p>
          <div className="mb-4">
            <PromotePicker items={promotable} value={promoteValue} onChange={setPromoteValue} disabled={busy} />
            {promotable.length === 0 && (
              <p className="mt-1.5 text-[11px] text-ink-3">Publish a song, beat, merch item or event to link it here.</p>
            )}
          </div>

          <p className="text-xs text-ink-3 mb-2">Days ({me.minDays}–{me.maxDays})</p>
          <input
            type="number"
            min={me.minDays}
            max={me.maxDays}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || me.minDays)}
            className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm mb-3"
          />
          <p className="text-sm font-semibold mb-4">Total: {formatNaira(me.dailyRateKobo * days)}</p>

          <button
            onClick={handleSubmit}
            disabled={busy || !file}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Submitting…" : `Pay ${formatNaira(me.dailyRateKobo * days)}`}
          </button>
        </div>
      )}
    </div>
  );
}
