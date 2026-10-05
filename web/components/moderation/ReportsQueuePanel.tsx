"use client";

import { useCallback, useEffect, useState } from "react";
import { useCanUse } from "./access";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type ReportRow = {
  id: string;
  targetType: "PRODUCT" | "EVENT" | "POST" | "PROFILE" | "CONVERSATION";
  reason: "INAPPROPRIATE_CONTENT" | "COPYRIGHT_CLAIM" | "BUG" | "FEATURE_REQUEST";
  status: "OPEN" | "IN_REVIEW" | "RESOLVED";
  details: string | null;
  slaDueAt: string | null;
  createdAt: string;
  reporter: { handle: string; displayName: string };
  product: { id: string; title: string; type: string; creator: { handle: string; displayName: string } } | null;
  event: { id: string; title: string; creator: { handle: string; displayName: string } } | null;
  post: { id: string; body: string; author: { handle: string; displayName: string } } | null;
  profile: { id: string; handle: string; displayName: string } | null;
  conversationId: string | null;
};

const REASON_LABEL: Record<ReportRow["reason"], string> = {
  INAPPROPRIATE_CONTENT: "Inappropriate content",
  COPYRIGHT_CLAIM: "Copyright claim",
  BUG: "Bug report",
  FEATURE_REQUEST: "Feature request",
};

const PRODUCT_HREF: Record<string, string> = { RELEASE: "/r", BEAT: "/b", MERCH: "/m" };

function targetSummary(r: ReportRow) {
  if (r.reason === "BUG" || r.reason === "FEATURE_REQUEST") {
    return { label: "App feedback", href: null };
  }
  if (r.product) {
    const href = PRODUCT_HREF[r.product.type] ? `${PRODUCT_HREF[r.product.type]}/${r.product.id}` : null;
    return { label: `${r.product.type} · "${r.product.title}" by ${r.product.creator.displayName}`, href };
  }
  if (r.event) {
    return { label: `Event · "${r.event.title}" by ${r.event.creator.displayName}`, href: `/e/${r.event.id}` };
  }
  if (r.post) {
    return { label: `Post by ${r.post.author.displayName}: "${r.post.body.slice(0, 60)}"`, href: null };
  }
  if (r.profile) {
    return { label: `Profile · @${r.profile.handle}`, href: `/u/${r.profile.handle}` };
  }
  if (r.conversationId) {
    return { label: "Direct message conversation", href: null };
  }
  return { label: "Unknown target", href: null };
}

function slaLabel(slaDueAt: string | null) {
  if (!slaDueAt) return null;
  const ms = new Date(slaDueAt).getTime() - Date.now();
  const hours = Math.round(Math.abs(ms) / (60 * 60 * 1000));
  return ms < 0 ? { text: `Overdue by ${hours}h`, overdue: true } : { text: `Due in ${hours}h`, overdue: false };
}

// Extracted verbatim (behavior-for-behavior) out of app/(app)/moderation/
// page.tsx as part of the dashboard rebuild (DECISIONS.md) — was previously
// inlined directly in ModerationPage, always shown at the bottom regardless
// of which panels were visible. Now lives in the "Overview" section of the
// sidebar, same open/in-review-first report queue.
export function ReportsQueuePanel() {
  // Takedowns from a report share the "Take down products" switch.
  const takedownAllowed = useCanUse()("productTakedown");
  const toast = useToast();
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/reports");
    if (!res.ok) {
      setReports([]);
      return;
    }
    const data: { reports: ReportRow[] } = await res.json();
    setReports(data.reports);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, [load]);

  async function act(id: string, action: "review" | "dismiss" | "takedown") {
    if (action === "takedown") {
      const ok = await toast.confirm("Take down this listing? It comes off sale and every discovery surface immediately, every buyer's entitlement is revoked, and the creator's earnings from it are reversed in the ledger. This cannot be undone.", { confirmLabel: "Take down", destructive: true });
      if (!ok) return;
    }
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/reports/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not update report");
      }
      if (action === "takedown") {
        const data: { refundFailures?: { orderId: string; reason: string }[] } = await res.json();
        if (data.refundFailures && data.refundFailures.length > 0) {
          toast.error(
            `Taken down, but ${data.refundFailures.length} order${data.refundFailures.length === 1 ? "" : "s"} couldn't be auto-refunded — check the wallet ledger and refund manually via Flutterwave.`,
          );
        } else {
          toast.success("Taken down and every paid buyer refunded.");
        }
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="text-xs text-ink-3 mb-6">Open and in-review reports, soonest SLA first.</p>
      {reports === null ? (
        <LoadingSpinner full size="md" />
      ) : reports.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing in the queue.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((r) => {
            const target = targetSummary(r);
            const sla = slaLabel(r.slaDueAt);
            const canTakedown =
              takedownAllowed && r.status === "IN_REVIEW" && r.reason === "COPYRIGHT_CLAIM" && r.targetType === "PRODUCT";
            return (
              <div key={r.id} className="rounded-lg border border-line-soft p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="rounded-full bg-red/10 text-red-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                    {REASON_LABEL[r.reason]}
                  </span>
                  {sla && (
                    <span className={`text-[12px] font-semibold ${sla.overdue ? "text-red-soft" : "text-ink-3"}`}>{sla.text}</span>
                  )}
                </div>
                {target.href ? (
                  <Link href={target.href} className="text-sm font-semibold mb-1 block">
                    {target.label}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold mb-1">{target.label}</p>
                )}
                {r.details && <p className="text-sm text-ink-2 mb-2">{r.details}</p>}
                {r.conversationId && <ReportedConversation conversationId={r.conversationId} />}
                <p className="text-[12px] text-ink-3 mb-3">
                  Reported by {r.reporter.displayName} · {new Date(r.createdAt).toLocaleString("en-NG")} · {r.status}
                </p>
                <div className="flex items-center gap-2">
                  {r.status === "OPEN" && (
                    <button
                      type="button"
                      onClick={() => act(r.id, "review")}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    >
                      Start review
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => act(r.id, "dismiss")}
                    disabled={busyId === r.id}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Dismiss
                  </button>
                  {canTakedown && (
                    <button
                      type="button"
                      onClick={() => act(r.id, "takedown")}
                      disabled={busyId === r.id}
                      className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Take down & refund
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ConversationView = {
  participants: { id: string; handle: string; displayName: string }[];
  messages: {
    id: string;
    senderId: string;
    kind: string;
    body: string | null;
    imageUrl: string | null;
    shareType: string | null;
    shareId: string | null;
    deletedAt: string | null;
    createdAt: string;
  }[];
};

// A reported direct-message conversation (explicit ask, 2026-10-04) —
// moderators can only open a conversation someone in it has reported (GET
// /api/admin/conversations/[id] checks that). Loaded on demand.
function ReportedConversation({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ConversationView | null>(null);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) {
      const res = await apiFetch(`/api/admin/conversations/${conversationId}`).catch(() => null);
      if (res?.ok) setData(await res.json());
      else setFailed(true);
    }
  }

  const nameOf = (id: string) => data?.participants.find((p) => p.id === id)?.displayName ?? "Someone";
  return (
    <div className="mb-3">
      <button type="button" onClick={toggle} className="text-xs font-semibold text-red-soft">
        {open ? "Hide conversation" : "View conversation"}
      </button>
      {open && (
        <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-line-soft bg-surface-2 p-3">
          {failed ? (
            <p className="text-xs text-ink-3">Couldn&apos;t load this conversation.</p>
          ) : !data ? (
            <p className="text-xs text-ink-3">Loading…</p>
          ) : data.messages.length === 0 ? (
            <p className="text-xs text-ink-3">No messages (they may have disappeared).</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.messages.map((m) => (
                <li key={m.id} className="text-xs">
                  <span className="font-semibold">{nameOf(m.senderId)}</span>{" "}
                  <span className="text-ink-3">{new Date(m.createdAt).toLocaleString("en-NG")}</span>
                  <br />
                  {m.deletedAt ? (
                    <span className="italic text-ink-3">Deleted by sender</span>
                  ) : m.kind === "IMAGE" && m.imageUrl ? (
                    <a href={m.imageUrl} target="_blank" rel="noreferrer" className="text-red-soft underline">
                      Photo{m.body ? ` — ${m.body}` : ""}
                    </a>
                  ) : m.kind === "SHARE" ? (
                    <span className="text-ink-2">
                      Shared {m.shareType?.toLowerCase()} {m.shareId}
                      {m.body ? ` — ${m.body}` : ""}
                    </span>
                  ) : (
                    <span className={m.kind === "SYSTEM" ? "italic text-ink-3" : "text-ink-2"}>{m.body}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
