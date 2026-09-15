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
};

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
  }, []);

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
      const res = await apiFetch("/api/billboards", { method: "POST", body: JSON.stringify({ key, days }) });
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
