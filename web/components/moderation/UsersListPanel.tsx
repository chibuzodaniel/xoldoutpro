"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

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
export function UsersListPanel() {
  const [q, setQ] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard debounced-fetch-on-input-change pattern
    setLoading(true);
    setExpandedId(null); // clears a stale expanded row when the query/filter/page changes underneath it
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
            {data.users.map((u) => {
              const expanded = expandedId === u.id;
              return (
                <div key={u.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : u.id)}
                    className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
                  >
                    <p className="text-sm truncate min-w-0">
                      {u.displayName} <span className="text-ink-3">@{u.handle}</span>
                      {u.isVerified && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Verified</span>}
                      {u.isModerator && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-ink-3">Mod</span>}
                      {u.deletedAt && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Deleted</span>}
                    </p>
                    <span className="text-ink-3 shrink-0">{expanded ? "▾" : "›"}</span>
                  </button>
                  {expanded && (
                    <div className="flex items-center justify-between gap-3 pb-3">
                      <p className="text-[11px] text-ink-3 truncate">
                        {u.email} · joined {new Date(u.createdAt).toLocaleDateString("en-NG")} · {u.listingCount} listing
                        {u.listingCount === 1 ? "" : "s"}
                      </p>
                      <Link href={`/u/${u.handle}`} className="text-xs font-semibold shrink-0">
                        View
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
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

