"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { MyMembershipsSheet } from "@/components/communities/MyMembershipsSheet";
import { COMMUNITY_CATEGORIES, DIRECTORY_FILTERS, type DirectoryFilter } from "@/lib/communities/constants";

type Community = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  category: string | null;
  isFeatured: boolean;
  isVerified: boolean;
  owner: { displayName: string };
  memberCount: number;
  isPaid: boolean;
  fromPriceKobo: number | null;
  myStatus: "member" | "expired" | "pending" | "approved" | null;
};

// Socials → Communities (v2, design/v2-prototype). Fetched when the filters
// change (debounced search) — never polled.
export function CommunitiesDirectory() {
  const router = useRouter();
  const toast = useToast();
  const { appUser } = useAuth();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DirectoryFilter | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [items, setItems] = useState<Community[] | null>(null);
  const [code, setCode] = useState("");
  const [mineOpen, setMineOpen] = useState(false);
  const closeMine = useCallback(() => setMineOpen(false), []);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (filter) sp.set("filter", filter);
    if (category) sp.set("category", category);
    apiFetch(`/api/communities?${sp}`)
      .then((res) => (res.ok ? res.json() : { communities: [] }))
      .then((d) => !cancelled && setItems(d.communities ?? []))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [query, filter, category]);

  async function applyCode() {
    const c = code.trim().toUpperCase();
    if (!c) return;
    const res = await apiFetch(`/api/communities/resolve?code=${encodeURIComponent(c)}`).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) return toast.error(typeof d.error === "string" ? d.error : "That code didn't work");
    router.push(`/groups/${d.community.id}?invite=${encodeURIComponent(c)}`);
  }

  const pill = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold ${active ? "bg-white text-black" : "border border-line bg-surface text-ink-2"}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => router.push(appUser ? "/communities/new" : "/login")}
          className="flex items-center justify-center gap-2 rounded-full bg-red px-4 py-3.5 text-[15px] font-bold text-white"
        >
          <span className="text-lg leading-none">+</span> Create community
        </button>
        <button
          type="button"
          onClick={() => (appUser ? setMineOpen(true) : router.push("/login"))}
          className="rounded-full border border-line px-4 py-3.5 text-[15px] font-bold"
        >
          My memberships
        </button>
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities" aria-label="Search communities" className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Community shortcuts">
        {DIRECTORY_FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(filter === f.key ? null : f.key)} className={`${pill(filter === f.key)} ${filter === f.key ? "" : "!bg-transparent"}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]" aria-label="Community categories">
        <button type="button" onClick={() => setCategory(null)} className={pill(!category)}>
          All
        </button>
        {COMMUNITY_CATEGORIES.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(category === c ? null : c)} className={pill(category === c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyCode()}
          placeholder="Have an invite code?"
          aria-label="Invite code"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-3 text-[14px] uppercase outline-none placeholder:normal-case placeholder:text-ink-3"
        />
        <button type="button" onClick={applyCode} className="shrink-0 rounded-full border border-line px-4 py-3 text-[14px] font-bold">
          Use code
        </button>
      </div>

      {items === null ? (
        <p className="py-10 text-center text-sm text-ink-3">Loading communities…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-line-soft p-6 text-center text-sm text-ink-3">No communities match. Try another filter, or create one.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <article key={c.id} className="overflow-hidden rounded-[24px] border border-line-soft bg-surface">
              <Link href={`/groups/${c.id}`} className="relative block h-24 bg-gradient-to-br from-red/60 via-red-tint to-black">
                {c.bannerUrl && <FallbackImg src={c.bannerUrl} alt="" className="h-full w-full object-cover" fallback={null} />}
                {c.isFeatured && <span className="absolute left-3 top-3 rounded-full bg-red px-2.5 py-1 text-[11px] font-extrabold text-white">FEATURED</span>}
              </Link>
              <div className="px-4 pb-4">
                <div className="relative z-10 -mt-7 h-14 w-14 overflow-hidden rounded-xl border-2 border-surface bg-gradient-to-br from-red/50 to-black">
                  <FallbackImg src={c.logoUrl} alt={c.name} className="h-full w-full object-cover" fallback={null} />
                </div>
                <Link href={`/groups/${c.id}`} className="mt-2 flex items-center gap-1.5 text-[20px] font-bold leading-tight">
                  <span className="truncate">{c.name}</span>
                  {c.isVerified && <VerifiedBadge className="h-4 w-4 shrink-0" />}
                </Link>
                {c.description && <p className="mt-1 line-clamp-2 text-[14px] text-ink-3">{c.description}</p>}
                <p className="mt-1.5 truncate text-[12px] text-ink-3">
                  by {c.owner.displayName}
                  {c.category ? ` · ${c.category}` : ""} · {c.memberCount.toLocaleString("en-NG")} members
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  {c.isPaid && c.fromPriceKobo ? (
                    <span className="rounded-full border border-red bg-red-tint px-3 py-1 text-[12px] font-bold">PAID · from ₦{(c.fromPriceKobo / 100).toLocaleString("en-NG")}</span>
                  ) : (
                    <span className="rounded-full border border-line px-3 py-1 text-[12px] font-bold">FREE</span>
                  )}
                  <Link
                    href={`/groups/${c.id}`}
                    className={`shrink-0 rounded-full px-5 py-2.5 text-[14px] font-bold ${c.myStatus === "member" ? "border border-line" : c.myStatus === "pending" ? "border border-line text-ink-3" : "bg-red text-white"}`}
                  >
                    {c.myStatus === "member" ? "Open" : c.myStatus === "pending" ? "Pending" : c.myStatus === "approved" ? "Pay to join" : c.myStatus === "expired" ? "Renew" : "Join Community"}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <MyMembershipsSheet open={mineOpen} onClose={closeMine} />
    </div>
  );
}
