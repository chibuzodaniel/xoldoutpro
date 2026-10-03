"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { ShareButton } from "@/components/ui/ShareButton";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { BroadcastIcon } from "@/components/live/LiveIcons";
import { FallbackImg } from "@/components/ui/FallbackImg";

export type LivePublicInfo = {
  id: string;
  title: string;
  description: string | null;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  scheduledFor: string | null;
  isPaidAccess: boolean;
  priceXg: number;
  coverImageLadder: Record<string, string> | null;
  creator: { handle: string; displayName: string; avatarUrl: string | null };
  reminderCount: number;
  remindedByMe: boolean;
  isHost: boolean;
};

function countdown(ms: number): string {
  if (ms <= 0) return "Starting any moment";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

/**
 * What a shared link to a scheduled Live shows (explicit ask: schedule a Live
 * and share the link for people to join): host, title, a live countdown,
 * "Remind me" (everyone reminded is alerted the moment it starts), and Share.
 * The host gets "Start Live now" / "Cancel" instead. The parent polls the
 * Live's status and swaps this for the actual room as soon as it starts.
 */
export function UpcomingLive({ live, onChange }: { live: LivePublicInfo; onChange: (next: LivePublicInfo) => void }) {
  const router = useRouter();
  const toast = useToast();
  const { firebaseUser } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startsAt = live.scheduledFor ? new Date(live.scheduledFor) : null;
  const cover = live.coverImageLadder?.["1024"] ?? null;

  async function toggleReminder() {
    if (!firebaseUser) {
      router.push(`/login?next=/live/${live.id}`);
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/live/${live.id}/remind`, { method: live.remindedByMe ? "DELETE" : "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update your reminder");
      onChange({ ...live, remindedByMe: data.remindedByMe, reminderCount: data.reminderCount });
      if (data.remindedByMe) toast.success("We'll notify you the moment it starts");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function startNow() {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/live/${live.id}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the Live");
      router.push(`/live/${live.id}/broadcast`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm("Cancel this scheduled Live? Its link will show it as cancelled.")) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/live/${live.id}/end`, { method: "POST" });
      if (!res.ok && res.status !== 409) throw new Error("Could not cancel the Live");
      toast.success("Scheduled Live cancelled");
      router.push("/live");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-10 pt-6">
      <div className="relative mb-5 aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-[#3a1460] via-[#2a0f45] to-[#0d0614]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 cover ladder rung
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <FallbackImg
              src={live.creator.avatarUrl}
              alt={live.creator.displayName}
              className="h-24 w-24 rounded-full object-cover border-2 border-white/20"
              fallback={<InitialsAvatar name={live.creator.displayName} className="h-24 w-24 text-3xl border-2" />}
            />
          </div>
        )}
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
          <BroadcastIcon className="h-3.5 w-3.5 text-red-soft" />
          Upcoming Live
        </span>
      </div>

      <p className="text-[13px] text-ink-3">@{live.creator.handle} is going live</p>
      <h1 className="mt-1 font-serif text-[28px] leading-tight">{live.title}</h1>
      {live.description && <p className="mt-2 text-sm text-ink-2 whitespace-pre-wrap">{live.description}</p>}

      <div className="mt-5 rounded-2xl border border-line-soft bg-surface px-4 py-4 text-center">
        <p className="text-[11px] uppercase tracking-widest text-ink-3">Starts in</p>
        <p className="mt-1 font-serif text-[32px] tabular-nums" suppressHydrationWarning>
          {startsAt ? countdown(startsAt.getTime() - now) : "—"}
        </p>
        {startsAt && (
          <p className="text-[13px] text-ink-3" suppressHydrationWarning>
            {startsAt.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
          </p>
        )}
        {live.isPaidAccess && <p className="mt-2 text-[13px] font-semibold text-amber">{live.priceXg} XG to join</p>}
      </div>

      <p className="mt-3 text-center text-[13px] text-ink-3">
        {live.reminderCount === 0 ? "Be the first to get a reminder" : `${live.reminderCount.toLocaleString("en-NG")} ${live.reminderCount === 1 ? "person" : "people"} will be notified`}
      </p>

      <div className="mt-5 flex flex-col gap-2.5">
        {live.isHost ? (
          <>
            <button onClick={startNow} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-red px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50">
              <BroadcastIcon className="h-5 w-5" />
              {busy ? "Starting…" : "Start Live now"}
            </button>
            <ShareButton
              title={live.title}
              text={`I'm going live on XOLDOUT: ${live.title}`}
              path={`/live/${live.id}`}
              label="Share link"
              className="justify-center rounded-xl border border-line bg-surface py-3.5 text-[15px] text-ink"
            />
            <button onClick={cancel} disabled={busy} className="py-2 text-[13px] text-ink-3 disabled:opacity-50">
              Cancel this Live
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleReminder}
              disabled={busy}
              className={`rounded-xl px-4 py-3.5 text-[15px] font-semibold disabled:opacity-50 ${live.remindedByMe ? "border border-line text-ink" : "bg-red text-white"}`}
            >
              {live.remindedByMe ? "✓ You'll be reminded" : "🔔 Remind me"}
            </button>
            <ShareButton
              title={live.title}
              text={`${live.creator.displayName} is going live on XOLDOUT: ${live.title}`}
              path={`/live/${live.id}`}
              label="Share"
              className="justify-center rounded-xl border border-line bg-surface py-3.5 text-[15px] text-ink"
            />
          </>
        )}
      </div>
    </div>
  );
}
