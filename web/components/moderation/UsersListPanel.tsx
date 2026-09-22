"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { formatNairaShort } from "./AmbassadorsPanel";

type UserRow = {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  createdAt: string;
  deletedAt: string | null;
  isModerator: boolean;
  isVerified: boolean;
  listingCount: number;
};

type UsersPage = { users: UserRow[]; page: number; totalPages: number; total: number };

// Explicit ask: "moderators should be able to see the list of users in
// their dashboard" — a searchable, paginated directory. Emails are shown
// here (unlike ManageModeratorsPanel, which hides moderator emails from
// peer moderators) because looking up an ordinary user by email is normal
// moderator/support work, not a privacy concern between staff.
//
// Explicit ask, 2026-09-22: clicking any user opens their full moderator
// detail view (income, products, activity) instead of the old
// expand-row-then-follow-a-link two-step — same list<->detail switch
// ProductsPanel already uses, for the same "one thing at a time" reason.
export function UsersListPanel() {
  const [q, setQ] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard debounced-fetch-on-input-change pattern
    setLoading(true);
    const handle = setTimeout(async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set("q", q.trim());
      if (includeDeleted) params.set("includeDeleted", "1");
      const res = await apiFetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [q, includeDeleted, page]);

  if (selectedId) {
    return <UserDetail userId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Users {data ? `(${data.total})` : ""}</p>

      <div className="flex gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by handle, name, or email"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink-3 mb-3">
        <input
          type="checkbox"
          checked={includeDeleted}
          onChange={(e) => {
            setIncludeDeleted(e.target.checked);
            setPage(1);
          }}
        />
        Include deleted accounts
      </label>

      {loading && data === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : data === null || data.users.length === 0 ? (
        <p className="text-xs text-ink-3">No users found.</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {data.users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setSelectedId(u.id)}
                className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">
                    {u.displayName} <span className="text-ink-3">@{u.handle}</span>
                    {u.isVerified && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Verified</span>}
                    {u.isModerator && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-ink-3">Mod</span>}
                    {u.deletedAt && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Deleted</span>}
                  </p>
                  <p className="text-[11px] text-ink-3 truncate">
                    {u.email} · joined {new Date(u.createdAt).toLocaleDateString("en-NG")} · {u.listingCount} listing
                    {u.listingCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-ink-3 shrink-0">›</span>
              </button>
            ))}
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-[11px] text-ink-3">
                Page {data.page} of {data.totalPages}
              </p>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={loading || page >= data.totalPages}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { RELEASE: "Music", BEAT: "Beat", MERCH: "Merch", EVENT: "Event" };

type ProductRow = {
  id: string;
  type: string;
  title: string;
  priceKobo: number;
  status: string;
  createdAt: string;
  sold: number;
  cap: number | null;
  commissionPercent: number;
};

type PurchaseRow = {
  orderId: string;
  productTitle: string;
  productType: string | null;
  amountKobo: number;
  status: string;
  createdAt: string;
};

type ActivityRow = {
  id: string;
  label: string;
  amountKobo: number;
  status: string;
  orderId: string | null;
  createdAt: string;
};

type PayoutRow = {
  id: string;
  amountKobo: number;
  netKobo: number;
  status: string;
  createdAt: string;
  payoutAccount: { bankName: string; accountNumber: string; accountName: string };
};

type UserDetailData = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    email: string;
    bio: string | null;
    createdAt: string;
    deletedAt: string | null;
    isModerator: boolean;
    isSuperModerator: boolean;
    isVerified: boolean;
    creatorPlan: string | null;
  };
  wallet: {
    availableKobo: number;
    pendingKobo: number;
    totalEarnedKobo: number;
    totalWithdrawnKobo: number;
    earnedByCategory: Record<string, number>;
  };
  products: ProductRow[];
  purchases: PurchaseRow[];
  activity: ActivityRow[];
  payouts: PayoutRow[];
};

// Full view-only picture of one user (explicit ask, 2026-09-22: "manage the
// users income to view all products the users has uploaded, how much the
// user has made, all activities on the platform"). View-only by explicit
// choice — money corrections still only ever go through the dedicated
// recompute tools, never an ad hoc edit here.
function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [data, setData] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    setLoading(true);
    (async () => {
      const res = await apiFetch(`/api/admin/users/${userId}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [userId]);

  return (
    <div>
      <button type="button" onClick={onBack} className="text-xs font-semibold text-ink-3 mb-4">
        ‹ Back to users
      </button>

      {loading || !data ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-sm font-semibold">
                {data.user.displayName} <span className="text-ink-3 font-normal">@{data.user.handle}</span>
                {data.user.isVerified && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Verified</span>}
                {data.user.isSuperModerator ? (
                  <span className="ml-1.5 text-[10px] uppercase tracking-widest text-ink-3">Super mod</span>
                ) : data.user.isModerator ? (
                  <span className="ml-1.5 text-[10px] uppercase tracking-widest text-ink-3">Mod</span>
                ) : null}
                {data.user.deletedAt && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Deleted</span>}
              </p>
              <Link href={`/u/${data.user.handle}`} className="text-xs font-semibold shrink-0">
                Public profile ↗
              </Link>
            </div>
            <p className="text-xs text-ink-3">
              {data.user.email} · joined {new Date(data.user.createdAt).toLocaleDateString("en-NG")} · Plan: {data.user.creatorPlan ?? "Not chosen"}
            </p>
            {data.user.bio && <p className="text-xs text-ink-2 mt-2">{data.user.bio}</p>}
          </div>

          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Income</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-[11px] text-ink-3">Available</p>
                <p className="text-sm font-semibold">{formatNairaShort(data.wallet.availableKobo)}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">Pending</p>
                <p className="text-sm font-semibold">{formatNairaShort(data.wallet.pendingKobo)}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">Total earned</p>
                <p className="text-sm font-semibold">{formatNairaShort(data.wallet.totalEarnedKobo)}</p>
              </div>
              <div>
                <p className="text-[11px] text-ink-3">Total withdrawn</p>
                <p className="text-sm font-semibold">{formatNairaShort(data.wallet.totalWithdrawnKobo)}</p>
              </div>
            </div>
            {Object.keys(data.wallet.earnedByCategory).length > 0 && (
              <p className="text-[11px] text-ink-3">
                By category:{" "}
                {Object.entries(data.wallet.earnedByCategory)
                  .map(([type, kobo]) => `${TYPE_LABEL[type] ?? type} ${formatNairaShort(kobo)}`)
                  .join(" · ")}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Products ({data.products.length})</p>
            {data.products.length === 0 ? (
              <p className="text-xs text-ink-3">No products uploaded.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line-soft">
                {data.products.map((p) => (
                  <div key={p.id} className="py-2">
                    <p className="text-sm truncate">
                      {p.title}{" "}
                      {p.status === "DELETED" && <span className="ml-1 text-[10px] uppercase tracking-widest text-red-soft">Taken down</span>}
                      {p.status === "DRAFT" && <span className="ml-1 text-[10px] uppercase tracking-widest text-ink-3">Draft</span>}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      {TYPE_LABEL[p.type] ?? p.type} · {p.priceKobo === 0 ? "Free" : formatNairaShort(p.priceKobo)} · {p.sold} sold
                      {p.cap != null ? ` / ${p.cap} cap` : ""} · {p.commissionPercent}% commission
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Activity ({data.activity.length})</p>
            {data.activity.length === 0 ? (
              <p className="text-xs text-ink-3">No wallet activity yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line-soft max-h-96 overflow-y-auto">
                {data.activity.map((a) => (
                  <div key={a.id} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm">{a.label}</p>
                      <p className="text-[11px] text-ink-3">
                        {new Date(a.createdAt).toLocaleString("en-NG")}
                        {a.status === "PENDING" ? " · Pending" : ""}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold shrink-0 ${a.amountKobo < 0 ? "text-red-soft" : "text-green"}`}>
                      {a.amountKobo < 0 ? "-" : "+"}
                      {formatNairaShort(Math.abs(a.amountKobo))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Purchases ({data.purchases.length})</p>
            {data.purchases.length === 0 ? (
              <p className="text-xs text-ink-3">No purchases yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line-soft">
                {data.purchases.map((p) => (
                  <div key={p.orderId} className="py-2">
                    <p className="text-sm truncate">{p.productTitle}</p>
                    <p className="text-[11px] text-ink-3">
                      {formatNairaShort(p.amountKobo)} · {p.status} · {new Date(p.createdAt).toLocaleString("en-NG")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.payouts.length > 0 && (
            <div className="rounded-lg border border-line-soft p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Payouts ({data.payouts.length})</p>
              <div className="flex flex-col divide-y divide-line-soft">
                {data.payouts.map((p) => (
                  <div key={p.id} className="py-2">
                    <p className="text-sm">
                      {formatNairaShort(p.netKobo)} · {p.status}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      {p.payoutAccount.bankName} •••• {p.payoutAccount.accountNumber.slice(-4)} · {new Date(p.createdAt).toLocaleString("en-NG")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
