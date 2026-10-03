"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { uploadImage } from "@/lib/uploadImage";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { formatNairaShort } from "./AmbassadorsPanel";

// Matches components/discover/BillboardRail.tsx's aspect-[4/5] display —
// cropping to the same ratio here means what a moderator frames is exactly
// what shows on Discover, not a server-side center-crop guess.
const BILLBOARD_ASPECT = 4 / 5;
const BILLBOARD_OUTPUT_WIDTH = 1024;
const BILLBOARD_OUTPUT_HEIGHT = 1280;
type BillboardRow = {
  id: string;
  status: "PENDING_PAYMENT" | "PENDING_REVIEW" | "ACTIVE" | "REJECTED" | "REMOVED";
  artworkUrl: string;
  days: number;
  paidKobo: number;
  expiresAt: string | null;
  isModeratorAdded: boolean;
  viewCount: number;
  rejectionReason: string | null;
  creator: { handle: string; displayName: string } | null;
};

const BILLBOARD_STATUS_LABEL: Record<BillboardRow["status"], string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PENDING_REVIEW: "Awaiting review",
  ACTIVE: "Live",
  REJECTED: "Rejected",
  REMOVED: "Removed",
};

function RejectBillboardControl({ busy, onReject }: { busy: boolean; onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={busy} className="text-xs font-semibold text-red-soft disabled:opacity-40">
        Reject
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-40 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={() => reason.trim() && onReject(reason.trim())}
        disabled={busy || !reason.trim()}
        className="text-xs font-semibold text-red-soft disabled:opacity-40"
      >
        Confirm
      </button>
    </div>
  );
}

// Explicit ask, 2026-09-14: "moderators too should approve every billboard
// posted before it goes live and if it's rejected the owner should be
// refunded and the moderators should include reasons for rejection" — see
// lib/commerce/billboards.ts's approveBillboard/rejectBillboard (rejection
// always refunds what was actually paid). Also the manual-add control
// ("moderators can also add artwork there manually") and per-billboard
// duration override/removal.
export function BillboardsPanel() {
  const toast = useToast();
  const [billboards, setBillboards] = useState<BillboardRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addCropFile, setAddCropFile] = useState<File | null>(null);
  const [addHandle, setAddHandle] = useState("");
  const [addDays, setAddDays] = useState(1);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/billboards");
    if (res.ok) setBillboards((await res.json()).billboards);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, [load]);

  async function act(id: string, body: object) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/admin/billboards/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update billboard");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function handleManualAdd() {
    if (!addFile) return;
    setAdding(true);
    try {
      const artworkKey = await uploadImage(addFile, "billboard");
      const res = await apiFetch("/api/admin/billboards", {
        method: "POST",
        body: JSON.stringify({ artworkKey, creatorHandle: addHandle.trim() || undefined, durationDays: addDays }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not add billboard");
      toast.success("Billboard added.");
      setAddFile(null);
      setAddHandle("");
      setAddDays(1);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAdding(false);
    }
  }

  const pending = billboards?.filter((b) => b.status === "PENDING_REVIEW") ?? [];
  const others = billboards?.filter((b) => b.status !== "PENDING_REVIEW") ?? [];

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Billboards</p>

      <p className="text-xs text-ink-3 mb-2">Awaiting review</p>
      {billboards === null ? (
        <p className="text-xs text-ink-3 mb-4">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-xs text-ink-3 mb-4">Nothing pending.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-5">
          {pending.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote R2 artwork */}
              <img src={b.artworkUrl} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{b.creator ? `@${b.creator.handle}` : "House ad"}</p>
                <p className="text-xs text-ink-3">
                  {b.days} day{b.days === 1 ? "" : "s"} · {formatNairaShort(b.paidKobo)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => act(b.id, { action: "approve" })}
                  disabled={busyId === b.id}
                  className="text-xs font-semibold text-green disabled:opacity-40"
                >
                  Approve
                </button>
                <RejectBillboardControl busy={busyId === b.id} onReject={(reason) => act(b.id, { action: "reject", rejectionReason: reason })} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-3 mb-2">All billboards</p>
      {billboards === null ? (
        <p className="text-xs text-ink-3 mb-4">Loading…</p>
      ) : others.length === 0 ? (
        <p className="text-xs text-ink-3 mb-4">None yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-5">
          {others.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote R2 artwork */}
              <img src={b.artworkUrl} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  {b.creator ? `@${b.creator.handle}` : "House ad"}{" "}
                  {b.status === "ACTIVE" && b.expiresAt && new Date(b.expiresAt) <= new Date() ? (
                    <button
                      type="button"
                      onClick={() => act(b.id, { extendDays: 1 })}
                      disabled={busyId === b.id}
                      title="Tap to reactivate for 1 day"
                      className="text-[10px] uppercase tracking-widest text-red-soft underline decoration-dotted disabled:opacity-40"
                    >
                      Expired
                    </button>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest text-ink-3">{BILLBOARD_STATUS_LABEL[b.status]}</span>
                  )}
                </p>
                <p className="text-xs text-ink-3">
                  {b.expiresAt ? `Until ${new Date(b.expiresAt).toLocaleString("en-NG")}` : `${b.days} day${b.days === 1 ? "" : "s"}`}
                  {` · ${(b.viewCount ?? 0).toLocaleString("en-NG")} views`}
                  {b.rejectionReason ? ` · ${b.rejectionReason}` : ""}
                </p>
              </div>
              {b.status === "ACTIVE" && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => act(b.id, { extendDays: 1 })}
                    disabled={busyId === b.id}
                    className="text-xs font-semibold text-red-soft disabled:opacity-40"
                  >
                    +1 day
                  </button>
                  <button
                    type="button"
                    onClick={() => act(b.id, { status: "REMOVED" })}
                    disabled={busyId === b.id}
                    className="text-xs font-semibold text-ink-3 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-3 mb-2">Add manually (no payment)</p>
      <div className="flex flex-col gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) setAddCropFile(picked);
            e.target.value = "";
          }}
          className="text-xs"
        />
        {addCropFile && (
          <ImageCropModal
            file={addCropFile}
            aspect={BILLBOARD_ASPECT}
            outputWidth={BILLBOARD_OUTPUT_WIDTH}
            outputHeight={BILLBOARD_OUTPUT_HEIGHT}
            onCancel={() => setAddCropFile(null)}
            onConfirm={(cropped) => {
              setAddCropFile(null);
              setAddFile(cropped);
            }}
          />
        )}
        <div className="flex items-center gap-2">
          <input
            value={addHandle}
            onChange={(e) => setAddHandle(e.target.value)}
            placeholder="Creator handle (optional)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
          />
          <input
            type="number"
            min={1}
            value={addDays}
            onChange={(e) => setAddDays(Number(e.target.value) || 1)}
            className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
          />
          <span className="text-xs text-ink-3">days</span>
        </div>
        <button
          type="button"
          onClick={handleManualAdd}
          disabled={adding || !addFile}
          className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add billboard"}
        </button>
      </div>
    </div>
  );
}

// PRD §18: verification criteria are undecided — this is deliberately a
// blunt handle-lookup toggle, not a review workflow with evidence/criteria.
