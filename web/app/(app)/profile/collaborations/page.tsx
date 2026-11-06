"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { BackHeader } from "@/components/ui/BackHeader";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/components/auth/AuthProvider";

type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Tag = {
  id: string;
  arrangement: "ROYALTY_SPLIT" | "CREDIT_ONLY";
  sharePercent: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: string;
  respondedAt: string | null;
  artist: Person;
  earnedKobo: number | null;
};
type ReleaseCollab = {
  product: { id: string; title: string; artworkUrl: string | null; createdAt: string };
  mainArtist: Person;
  isMine: boolean;
  mainSharePercent: number;
  mainEarnedKobo: number | null;
  collaborators: Tag[];
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_STYLE: Record<Tag["status"], string> = {
  PENDING: "bg-amber/15 text-amber",
  ACCEPTED: "bg-green/15 text-green",
  DECLINED: "bg-surface-2 text-ink-3",
};
const STATUS_LABEL: Record<Tag["status"], string> = { PENDING: "Pending", ACCEPTED: "Accepted", DECLINED: "Declined" };

function terms(tag: Tag) {
  return tag.arrangement === "ROYALTY_SPLIT" ? `${tag.sharePercent}% royalty share` : "Feature credit only";
}

// Featured artists & revenue sharing (explicit ask, 2026-11-06): the record
// of every arrangement this user is a party to, with what each side has
// earned. Requests to this user come first and can be accepted/declined here.
export default function CollaborationsPage() {
  const toast = useToast();
  const { appUser } = useAuth();
  const [releases, setReleases] = useState<ReleaseCollab[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch("/api/collaborations");
    if (!res.ok) return setReleases([]);
    const data = await res.json();
    setReleases(data.releases);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount
    load();
  }, []);

  async function respond(tag: Tag, action: "accept" | "decline") {
    if (action === "decline" && !(await toast.confirm("Decline this feature? You won't be credited and can't accept it later.", { confirmLabel: "Decline", destructive: true }))) {
      return;
    }
    setBusyId(tag.id);
    try {
      const res = await apiFetch(`/api/collaborations/${tag.id}`, { method: "POST", body: JSON.stringify({ action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
      toast.success(action === "accept" ? "Feature accepted. You're now credited on this release." : "Feature declined.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function withdraw(tag: Tag) {
    if (!(await toast.confirm(`Withdraw the request to ${tag.artist.displayName}?`, { confirmLabel: "Withdraw", destructive: true }))) return;
    setBusyId(tag.id);
    try {
      const res = await apiFetch(`/api/collaborations/${tag.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong");
      toast.success("Request withdrawn.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  const pendingForMe = (releases ?? []).flatMap((r) =>
    r.collaborators.filter((c) => c.artist.id === appUser?.id && c.status === "PENDING").map((c) => ({ release: r, tag: c })),
  );

  return (
    <div className="pb-24">
      <BackHeader title="Collaborations" />
      <div className="px-4 max-w-lg mx-auto">
        {releases === null ? (
          <LoadingSpinner full />
        ) : releases.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-serif text-xl mb-1">No collaborations yet</p>
            <p className="text-sm text-ink-3">
              Tag featured artists when you{" "}
              <Link href="/publish/music" className="text-red-soft">
                upload music
              </Link>
              , or accept a request here when someone tags you.
            </p>
          </div>
        ) : (
          <>
            {pendingForMe.length > 0 && (
              <section className="mb-6">
                <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Waiting for you</h2>
                <div className="flex flex-col gap-3">
                  {pendingForMe.map(({ release: r, tag }) => (
                    <div key={tag.id} className="rounded-xl border border-amber/40 bg-amber/5 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                          <FallbackImg src={r.product.artworkUrl} alt={r.product.title} className="h-full w-full object-cover" fallback={null} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{r.product.title}</p>
                          <p className="text-xs text-ink-3">
                            From{" "}
                            <Link href={`/u/${r.mainArtist.handle}`} className="text-ink-2">
                              {r.mainArtist.displayName}
                            </Link>{" "}
                            · {formatDate(tag.createdAt)}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm mb-1">
                        <span className="font-semibold">{terms(tag)}</span>
                      </p>
                      <p className="text-xs text-ink-3 mb-3">
                        {tag.arrangement === "ROYALTY_SPLIT"
                          ? `You'd get ${tag.sharePercent}% of ${r.mainArtist.displayName}'s earnings from every sale of this release (after the platform fee), paid into your wallet automatically from when you accept. ${r.mainArtist.displayName} keeps ${r.mainSharePercent}%.`
                          : `You'd be credited on this release and it would show on your profile. ${r.mainArtist.displayName} keeps 100% of the revenue.`}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => respond(tag, "accept")}
                          disabled={busyId === tag.id}
                          className="flex-1 rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => respond(tag, "decline")}
                          disabled={busyId === tag.id}
                          className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Agreements</h2>
            <div className="flex flex-col gap-3">
              {releases.map((r) => {
                const hasRoyalty = r.collaborators.some((c) => c.arrangement === "ROYALTY_SPLIT" && c.status !== "DECLINED");
                return (
                  <div key={r.product.id} className="rounded-xl border border-line bg-surface p-4">
                    <Link href={`/r/${r.product.id}`} className="flex items-center gap-3 mb-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-2">
                        <FallbackImg src={r.product.artworkUrl} alt={r.product.title} className="h-full w-full object-cover" fallback={null} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{r.product.title}</p>
                        <p className="text-xs text-ink-3">
                          {r.isMine ? "Your release" : `By ${r.mainArtist.displayName}`} · {formatDate(r.product.createdAt)}
                        </p>
                      </div>
                    </Link>

                    <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft text-xs">
                      <div className="flex items-center justify-between py-2">
                        <span>
                          <span className="font-semibold">{r.isMine ? "You" : r.mainArtist.displayName}</span>
                          <span className="text-ink-3"> · main artist{hasRoyalty ? ` · ${r.mainSharePercent}%` : " · 100%"}</span>
                        </span>
                        {(r.isMine || hasRoyalty) && <span className="font-semibold">{r.mainEarnedKobo != null ? naira(r.mainEarnedKobo) : ""}</span>}
                      </div>
                      {r.collaborators.map((c) => {
                        const isMe = c.artist.id === appUser?.id;
                        return (
                          <div key={c.id} className="flex items-center justify-between gap-2 py-2">
                            <span className="min-w-0">
                              <span className="font-semibold">{isMe ? "You" : c.artist.displayName}</span>
                              <span className="text-ink-3"> · {terms(c)}</span>
                              <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[c.status]}`}>
                                {STATUS_LABEL[c.status]}
                              </span>
                            </span>
                            <span className="shrink-0 flex items-center gap-2">
                              {c.arrangement === "ROYALTY_SPLIT" && c.status === "ACCEPTED" && c.earnedKobo != null && (
                                <span className="font-semibold">{naira(c.earnedKobo ?? 0)}</span>
                              )}
                              {r.isMine && c.status === "PENDING" && (
                                <button onClick={() => withdraw(c)} disabled={busyId === c.id} className="text-ink-3 disabled:opacity-50">
                                  Withdraw
                                </button>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10.5px] text-ink-3 mt-2">
                      Earnings are from paid sales of this release. Royalty shares are of the main artist&apos;s earnings after the platform fee,
                      counted from each artist&apos;s acceptance date.
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
