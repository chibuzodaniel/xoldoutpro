"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { XgCoin } from "@/components/live/LiveIcons";

// A battle invite ringing (explicit ask, 2026-10-08: "they will get a ring
// that the host is inviting them for a battle with usernames of all the
// people invited plus the details of the battle"). Arrives two ways: the
// push's link (?battleInvite=<id> on any page) and the in-app message poll
// (components/messages/InAppMessageBanner.tsx → "xoldout:battle-invite"),
// so it rings even where push didn't get through. Accept joins the battle
// and opens the Live; see lib/live/battle.ts respondToInvite.

type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null };
export type BattleInviteRingData = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  expiresAt: string;
  liveSessionId: string;
  host: Person;
  battle: { id: string; title: string; status: string; rounds: number; turnSeconds: number; votingSeconds: number; prizePlaces: number[]; prizeXg: number };
  people: Person[];
};

// Invites already answered or dismissed this visit — the poll keeps
// reporting a pending one until it lapses, so don't ring twice.
const handled = new Set<string>();

const PLACE = ["1st", "2nd", "3rd"];
function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A phone-style double ring every few seconds, plus vibration where supported. Returns stop(). */
function startRingtone(): () => void {
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    ctx = null;
  }
  const ring = () => {
    try {
      navigator.vibrate?.([400, 200, 400]);
    } catch {
      // no vibration
    }
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const start of [0, 0.5]) {
      for (const freq of [440, 480]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.12, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + 0.42);
      }
    }
  };
  ring();
  const id = setInterval(ring, 3000);
  return () => {
    clearInterval(id);
    void ctx?.close().catch(() => {});
  };
}

export function BattleInviteRing() {
  const [invite, setInvite] = useState<BattleInviteRingData | null>(null);
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  // From the in-app poll.
  useEffect(() => {
    const onInvite = (e: Event) => {
      const next = (e as CustomEvent<BattleInviteRingData>).detail;
      if (next?.status === "PENDING" && !handled.has(next.id)) setInvite((cur) => cur ?? next);
    };
    window.addEventListener("xoldout:battle-invite", onInvite);
    return () => window.removeEventListener("xoldout:battle-invite", onInvite);
  }, []);

  // From the push's link.
  const linkInviteId = searchParams.get("battleInvite");
  useEffect(() => {
    if (!linkInviteId || handled.has(linkInviteId)) return;
    let cancelled = false;
    apiFetch(`/api/live/battle-invites/${linkInviteId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { invite?: BattleInviteRingData } | null) => {
        if (cancelled || !data?.invite) return;
        const live = data.invite.status === "PENDING" && new Date(data.invite.expiresAt).getTime() > Date.now() && data.invite.battle.status === "READY";
        if (live) setInvite(data.invite);
        else toast.error("That battle invite is no longer active.");
      });
    return () => {
      cancelled = true;
    };
  }, [linkInviteId, toast]);

  const close = useCallback(() => {
    setInvite((cur) => {
      if (cur) handled.add(cur.id);
      return null;
    });
    // Drop ?battleInvite= so a refresh doesn't ring again.
    if (linkInviteId) router.replace(pathname);
  }, [linkInviteId, pathname, router]);

  // Ring until answered or the invite lapses.
  const inviteId = invite?.id;
  const expiresAt = invite?.expiresAt;
  useEffect(() => {
    if (!inviteId || !expiresAt) return;
    const stop = startRingtone();
    const lapse = setTimeout(close, Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    return () => {
      stop();
      clearTimeout(lapse);
    };
  }, [inviteId, expiresAt, close]);

  async function answer(accept: boolean) {
    if (!invite) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/live/battle-invites/${invite.id}`, { method: "POST", body: JSON.stringify({ accept }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const liveId = invite.liveSessionId;
      close();
      if (accept) {
        toast.success("You're in! Your followers are being told to come and support you.");
        router.push(`/live/${liveId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      close();
    } finally {
      setBusy(false);
    }
  }

  if (!invite) return null;
  const b = invite.battle;
  const prize = b.prizeXg > 0 ? b.prizePlaces.map((x, i) => `${PLACE[i]} ${x.toLocaleString("en-NG")} XG`).join(" · ") : "No prize — keep every gift you get";

  return (
    <div role="dialog" aria-modal="true" aria-label="Battle invite" className="fixed inset-0 z-[80] flex flex-col items-center justify-between bg-gradient-to-b from-[#3a1460] via-[#1a0a2b] to-black px-6 py-14 text-center">
      <div className="flex flex-col items-center">
        <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-amber">⚔️ Battle invite</p>
        <div className="relative mt-8">
          <span className="absolute inset-0 animate-ping rounded-full bg-amber/30" aria-hidden />
          <FallbackImg
            src={invite.host.avatarUrl}
            alt={invite.host.displayName}
            className="relative h-28 w-28 rounded-full border-4 border-amber object-cover"
            fallback={<InitialsAvatar name={invite.host.displayName} className="relative h-28 w-28 border-4 border-amber text-3xl" />}
          />
        </div>
        <p className="mt-6 text-[18px] text-white">
          <span className="font-bold">{invite.host.displayName}</span> is inviting you to a battle
        </p>
        <h2 className="mt-2 font-serif text-[32px] leading-tight text-white">{b.title}</h2>

        <div className="mt-5 flex max-w-sm flex-wrap justify-center gap-2">
          {invite.people.map((p) => (
            <span key={p.id} className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-white">
              @{p.handle}
            </span>
          ))}
        </div>

        <div className="mt-6 grid w-full max-w-sm grid-cols-3 gap-2 text-white">
          <div className="rounded-xl bg-white/[0.07] py-2.5">
            <p className="text-[18px] font-bold">{b.rounds}</p>
            <p className="text-[11px] text-white/90">round{b.rounds === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded-xl bg-white/[0.07] py-2.5">
            <p className="text-[18px] font-bold">{clock(b.turnSeconds)}</p>
            <p className="text-[11px] text-white/90">per turn</p>
          </div>
          <div className="rounded-xl bg-white/[0.07] py-2.5">
            <p className="text-[18px] font-bold">{clock(b.votingSeconds)}</p>
            <p className="text-[11px] text-white/90">voting</p>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[14px] font-semibold text-amber">
          <XgCoin className="h-4 w-4" />
          {prize}
        </p>
      </div>

      <div className="flex w-full max-w-xs items-center justify-between">
        <button type="button" disabled={busy} onClick={() => answer(false)} className="flex flex-col items-center gap-2 disabled:opacity-50">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red text-2xl text-white shadow-lg">✕</span>
          <span className="text-[13px] text-white">Decline</span>
        </button>
        <button type="button" disabled={busy} onClick={() => answer(true)} className="flex flex-col items-center gap-2 disabled:opacity-50">
          <span className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-green text-2xl text-white shadow-lg">⚔️</span>
          <span className="text-[13px] text-white">Accept</span>
        </button>
      </div>
    </div>
  );
}
