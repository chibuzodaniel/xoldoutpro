"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { JoinSheet, type CommunityPlan } from "@/components/communities/JoinSheet";
import { MembershipCardSheet } from "@/components/communities/MembershipCardSheet";
import { ReportSheet, COMMUNITY_REPORT_REASONS } from "@/components/trust/ReportSheet";
import { planPriceLabel } from "@/lib/communities/constants";
import { CountryFlag } from "@/components/profile/CountryFlag";
import { Timeline } from "@/components/communities/Timeline";

type Channel = {
  id: string;
  name: string;
  kind: string;
  planIds: string[];
  canOpen: boolean;
  last: { author: string; body: string; at: string } | null;
};
type Detail = {
  community: {
    id: string;
    handle: string | null;
    name: string;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    category: string | null;
    location: string | null;
    rules: string | null;
    inviteCode: string | null;
    isVerified: boolean;
    suspendedAt: string | null;
    isPrivate: boolean;
    memberCount: number;
    createdAt: string;
    creator: { handle: string; displayName: string; avatarUrl: string | null };
  };
  channels: Channel[];
  plans: CommunityPlan[];
  viewer: {
    signedIn: boolean;
    isOwner: boolean;
    isAdmin: boolean;
    membership: { role: string; planId: string | null; expiresAt: string | null; autoRenew: boolean; active: boolean } | null;
    joinRequest: { status: string; planId: string | null } | null;
  };
};
type Member = { userId: string; role: string; user: { id: string; handle: string; displayName: string; avatarUrl: string | null; countryCode?: string | null } };

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// A community (v2, design/v2-prototype): cover, logo, name, members ·
// category · privacy, the plan badge, Join / Manage, and Channels / Members /
// About. Channels open the chat (/groups/[id]?channel=…).
export function CommunityPage({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { appUser } = useAuth();
  const [data, setData] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  // Timeline replaces channels (explicit ask, 2026-11-11).
  const [tab, setTab] = useState<"timeline" | "members" | "about">("timeline");
  const [members, setMembers] = useState<Member[] | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinPlan, setJoinPlan] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const closeCard = useCallback(() => setCardOpen(false), []);
  const closeJoin = useCallback(() => setJoinOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/communities/${id}`).catch(() => null);
    if (!res || !res.ok) return setMissing(true);
    setData(await res.json());
  }, [id]);

  // ?join=<planId> (approved application), ?renew=1 (reminder), ?invite=<code>.
  /* eslint-disable react-hooks/set-state-in-effect -- one-time load + URL intent */
  useEffect(() => {
    load();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("invite")) setInvite(sp.get("invite"));
    if (sp.get("join") || sp.get("renew") === "1") {
      setJoinPlan(sp.get("join"));
      setJoinOpen(true);
    }
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (tab !== "members" || members !== null || !data?.viewer.membership) return;
    apiFetch(`/api/groups/${id}/members`)
      .then((res) => (res.ok ? res.json() : { members: [] }))
      .then((d) => setMembers(d.members ?? []))
      .catch(() => setMembers([]));
  }, [tab, members, data, id]);

  if (missing) return <p className="px-4 py-20 text-center text-ink-3">This community doesn&apos;t exist any more.</p>;
  if (!data) return <LoadingSpinner full size="lg" />;

  const { community: c, plans, viewer } = data;
  const m = viewer.membership;
  const paid = plans.filter((p) => p.priceKobo > 0);
  const fromKobo = paid.length ? Math.min(...paid.map((p) => p.priceKobo)) : null;
  const myPlan = m?.planId ? plans.find((p) => p.id === m.planId) : null;
  const pending = viewer.joinRequest?.status === "PENDING";
  const approvedPlanId = viewer.joinRequest?.status === "APPROVED" ? viewer.joinRequest.planId : null;

  async function share() {
    setMenuOpen(false);
    const url = `${window.location.origin}/groups/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: c.name, text: `Join ${c.name} on XOLDOUT`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // dismissed
    }
  }

  async function leave() {
    setMenuOpen(false);
    if (!(await toast.confirm(`Leave ${c.name}?${m?.expiresAt && m.active ? " Paid time left isn't refunded." : ""}`, { confirmLabel: "Leave", destructive: true }))) return;
    const res = await apiFetch(`/api/groups/${id}/join`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't leave");
    toast.success(`You left ${c.name}`);
    load();
  }

  const primary = viewer.isAdmin ? (
    <div className="flex gap-2">
      <Link href={`/groups/${id}/manage`} className="flex-1 rounded-full bg-red px-5 py-3.5 text-center text-[16px] font-bold text-white">
        Manage community
      </Link>
      <button type="button" onClick={() => setCardOpen(true)} className="shrink-0 rounded-full border border-line px-5 py-3.5 text-[15px] font-bold">
        My card
      </button>
    </div>
  ) : m?.active ? (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <span className="text-sm">
        <span className="font-semibold">{myPlan ? myPlan.name : "Member"}</span>
        <span className="text-ink-3">
          {m.expiresAt ? ` · ${m.autoRenew ? "renews" : "ends"} ${day(m.expiresAt)}` : " · no expiry"}
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        <button type="button" onClick={() => setCardOpen(true)} className="rounded-full bg-red px-4 py-2 text-[13px] font-bold text-white">
          Card
        </button>
        {m.expiresAt && myPlan && myPlan.priceKobo > 0 && (
          <button
            type="button"
            onClick={() => {
              setJoinPlan(myPlan.id);
              setJoinOpen(true);
            }}
            className="rounded-full border border-line px-4 py-2 text-[13px] font-bold"
          >
            Renew
          </button>
        )}
      </span>
    </div>
  ) : pending ? (
    <div className="w-full rounded-full border border-line px-5 py-3.5 text-center text-[15px] font-semibold text-ink-3">Application pending</div>
  ) : (
    <button
      type="button"
      onClick={() => {
        setJoinPlan(approvedPlanId ?? m?.planId ?? null);
        setJoinOpen(true);
      }}
      className="w-full rounded-full bg-red px-5 py-3.5 text-[16px] font-bold text-white"
    >
      {approvedPlanId ? "Pay to join" : m ? "Renew membership" : "Join Community"}
    </button>
  );

  return (
    <div className="pb-24">
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-red/60 via-red-tint to-black md:h-56">
        {c.bannerUrl && <FallbackImg src={c.bannerUrl} alt="" className="h-full w-full object-cover" fallback={null} />}
        <button type="button" onClick={() => router.back()} aria-label="Back" className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="Community options" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      </div>

      <div className="mx-auto max-w-3xl px-4">
        <div className="relative z-10 -mt-10 flex items-end gap-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-bg bg-gradient-to-br from-red/50 to-black">
            <FallbackImg src={c.logoUrl} alt={c.name} className="h-full w-full object-cover" fallback={null} />
          </div>
        </div>
        <h1 className="mt-3 flex items-center gap-2 font-serif text-[28px] font-bold leading-tight">
          {c.name}
          {c.isVerified && <VerifiedBadge className="h-5 w-5 shrink-0" />}
        </h1>
        {c.handle && <p className="text-ink-3">@{c.handle}</p>}
        <p className="mt-2 text-[14px] text-ink-2">
          {c.memberCount.toLocaleString("en-NG")} members
          {c.category ? ` · ${c.category}` : ""} · {c.isPrivate ? "Private" : "Public"}
        </p>
        <div className="mt-2">
          {fromKobo ? (
            <span className="inline-block rounded-full border border-red bg-red-tint px-3 py-1 text-[12px] font-bold">PAID · from ₦{(fromKobo / 100).toLocaleString("en-NG")}</span>
          ) : (
            <span className="inline-block rounded-full border border-line px-3 py-1 text-[12px] font-bold">FREE</span>
          )}
        </div>
        {c.suspendedAt && (
          <p className="mt-4 rounded-2xl border border-red/50 bg-red-tint px-4 py-3 text-sm">
            This community is suspended by XOLDOUT. Joining, payments and new messages are paused.
          </p>
        )}
        <div className="mt-4">{c.suspendedAt && !viewer.isAdmin ? null : primary}</div>

        <div role="tablist" className="mt-6 flex gap-6 border-b border-line-soft">
          {(["timeline", "members", "about"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-2.5 text-[17px] font-semibold capitalize ${tab === t ? "border-red text-ink" : "border-transparent text-ink-3"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "timeline" &&
          (viewer.isAdmin || (m && !pending) ? (
            <Suspense fallback={null}>
              <Timeline communityId={id} />
            </Suspense>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-ink-3">{pending ? "Your request to join is pending." : "Join to see the Timeline and take part."}</p>
              {!pending && (
                <button type="button" onClick={() => setJoinOpen(true)} className="mt-3 rounded-full bg-red px-5 py-2.5 text-sm font-bold text-white">
                  Join community
                </button>
              )}
            </div>
          ))}

        {tab === "members" &&
          (!m ? (
            <p className="py-8 text-center text-sm text-ink-3">Join to see who&apos;s here.</p>
          ) : members === null ? (
            <LoadingSpinner full size="md" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {members.map((mem) => (
                <li key={mem.userId}>
                  <Link href={`/u/${mem.user.handle}`} className="flex items-center gap-3 py-3">
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
                      <FallbackImg src={mem.user.avatarUrl} alt={mem.user.displayName} className="h-full w-full object-cover" fallback={null} />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1 font-semibold">
                      <span className="truncate">{mem.user.displayName}</span>
                      <CountryFlag code={mem.user.countryCode} />
                    </span>
                    {(mem.role === "ADMIN" || mem.userId === appUser?.id) && (
                      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-bold text-ink-2">
                        {mem.role === "ADMIN" ? "ADMIN" : "YOU"}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ))}

        {tab === "about" && (
          <div className="flex flex-col gap-5 py-5 text-[15px]">
            {c.description && <p className="whitespace-pre-wrap text-ink-2">{c.description}</p>}
            <div className="flex flex-col gap-1 text-sm text-ink-3">
              <span>
                Run by{" "}
                <Link href={`/u/${c.creator.handle}`} className="font-semibold text-ink">
                  {c.creator.displayName}
                </Link>
              </span>
              {c.location && <span>{c.location}</span>}
              <span>Since {day(c.createdAt)}</span>
            </div>
            {plans.length > 0 && (
              <div>
                <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-ink-3">Membership plans</h2>
                <ul className="flex flex-col gap-2">
                  {plans.map((p) => (
                    <li key={p.id} className="flex justify-between rounded-xl border border-line px-4 py-3">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-red-soft">{planPriceLabel(p)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.rules && (
              <div>
                <h2 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-ink-3">Community rules</h2>
                <p className="whitespace-pre-wrap text-ink-2">{c.rules}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <JoinSheet
        open={joinOpen}
        onClose={closeJoin}
        community={{ id, name: c.name, isPrivate: c.isPrivate }}
        plans={plans}
        defaultPlanId={joinPlan}
        approvedPlanId={approvedPlanId}
        currentPlanId={m?.planId ?? null}
        inviteCode={invite}
        onJoined={() => load()}
      />

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="COMMUNITY"
        targetId={id}
        reasons={COMMUNITY_REPORT_REASONS}
        title="Report community"
        detailsPlaceholder="What happened? (optional)"
      />
      {m && <MembershipCardSheet open={cardOpen} onClose={closeCard} communityId={id} />}

      <BottomSheet open={menuOpen} onClose={closeMenu} title={c.name}>
        <button type="button" onClick={share} className="w-full px-5 py-4 text-left text-[16px] font-semibold hover:bg-surface-2">
          Share
        </button>
        {viewer.isAdmin && (
          <Link href={`/groups/${id}/manage`} onClick={closeMenu} className="block px-5 py-4 text-[16px] font-semibold hover:bg-surface-2">
            Manage community
          </Link>
        )}
        {viewer.signedIn && !viewer.isOwner && (
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setReportOpen(true);
            }}
            className="w-full px-5 py-4 text-left text-[16px] font-semibold hover:bg-surface-2"
          >
            Report community
          </button>
        )}
        {m && !viewer.isOwner && (
          <button type="button" onClick={leave} className="w-full px-5 py-4 text-left text-[16px] font-semibold text-red-soft hover:bg-surface-2">
            Leave community
          </button>
        )}
      </BottomSheet>
    </div>
  );
}
