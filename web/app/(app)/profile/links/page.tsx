"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";
import { LINK_PLATFORMS, MAX_LINK_TITLE, MAX_PROFILE_LINKS, type ProfileLink } from "@/lib/profile/links";

type Draft = ProfileLink & { key: string };

function newKey() {
  return Math.random().toString(36).slice(2);
}

function isValidUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// Link-in-bio manager (design/v2-prototype, 2026-11-09): add links with an
// optional custom title, reorder them, switch them off without deleting, and
// remove them. Saves to User.socialLinks through the same PATCH /api/me as
// before; the array order is the order on the profile.
export default function ManageLinksPage() {
  const { appUser, refreshAppUser } = useAuth();
  if (!appUser) return <LoadingSpinner full size="lg" />;
  return <LinksEditor initial={appUser.socialLinks} handle={appUser.handle} onSaved={refreshAppUser} />;
}

function LinksEditor({ initial, handle, onSaved }: { initial: ProfileLink[]; handle: string; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const [links, setLinks] = useState<Draft[]>(() => initial.map((l) => ({ ...l, key: newKey() })));
  const [busy, setBusy] = useState(false);

  function update(key: string, patch: Partial<ProfileLink>) {
    setLinks((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function move(index: number, by: -1 | 1) {
    setLinks((cur) => {
      const next = [...cur];
      const target = index + by;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    const filled = links.filter((l) => l.url.trim());
    const bad = filled.find((l) => !isValidUrl(l.url.trim()));
    if (bad) {
      toast.error(`"${bad.url}" isn't a full web address. Start it with https://`);
      return;
    }
    setBusy(true);
    try {
      const socialLinks = filled.map((l) => ({
        platform: l.platform,
        url: l.url.trim(),
        ...(l.title?.trim() ? { title: l.title.trim() } : {}),
        ...(l.enabled === false ? { enabled: false } : {}),
      }));
      const res = await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ socialLinks }) });
      if (!res.ok) throw new Error("Could not save your links");
      await onSaved();
      toast.success("Links saved.");
      router.push("/profile");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-24">
      <BackHeader title="Manage links" />
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4">
        <p className="text-sm text-ink-3">
          These show on your profile at <span className="text-ink-2">xoldout.app/u/{handle}</span>, in this order. Switch one off to hide it without deleting it.
        </p>

        {links.length === 0 && <p className="rounded-2xl border border-line-soft p-6 text-center text-sm text-ink-3">No links yet.</p>}

        {links.map((link, i) => {
          const off = link.enabled === false;
          const titleHint = link.platform === "Link" ? "Title (e.g. Booking and management)" : `Title (optional, shows "${link.platform}")`;
          const urlInvalid = Boolean(link.url.trim()) && !isValidUrl(link.url.trim());
          return (
            <div key={link.key} className={`rounded-2xl border border-line bg-surface p-3.5 ${off ? "opacity-60" : ""}`}>
              <div className="flex items-center gap-2">
                <select
                  value={link.platform}
                  onChange={(e) => update(link.key, { platform: e.target.value })}
                  aria-label="Platform"
                  className="rounded-lg border border-line bg-bg px-2 py-2 text-sm outline-none"
                >
                  {LINK_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p === "Link" ? "Custom link" : p}
                    </option>
                  ))}
                </select>
                <span className="flex-1" />
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="h-8 w-8 rounded-full border border-line text-ink-2 disabled:opacity-30">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === links.length - 1}
                  aria-label="Move down"
                  className="h-8 w-8 rounded-full border border-line text-ink-2 disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!off}
                  aria-label={off ? "Show this link" : "Hide this link"}
                  onClick={() => update(link.key, { enabled: off })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${off ? "bg-line" : "bg-red"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${off ? "left-0.5" : "left-[22px]"}`} />
                </button>
              </div>
              <input
                value={link.title ?? ""}
                onChange={(e) => update(link.key, { title: e.target.value.slice(0, MAX_LINK_TITLE) })}
                placeholder={titleHint}
                aria-label="Link title"
                className="mt-2.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-red"
              />
              <input
                value={link.url}
                onChange={(e) => update(link.key, { url: e.target.value })}
                placeholder="https://..."
                inputMode="url"
                aria-label="Link address"
                className={`mt-2 w-full rounded-lg border bg-bg px-3 py-2.5 text-sm outline-none focus:border-red ${urlInvalid ? "border-red" : "border-line"}`}
              />
              <button type="button" onClick={() => setLinks((cur) => cur.filter((l) => l.key !== link.key))} className="mt-2 text-xs font-semibold text-ink-3">
                Delete link
              </button>
            </div>
          );
        })}

        {links.length < MAX_PROFILE_LINKS && (
          <button
            type="button"
            onClick={() => setLinks((cur) => [...cur, { key: newKey(), platform: "Instagram", url: "", enabled: true }])}
            className="rounded-full border border-dashed border-line px-4 py-3 text-sm font-semibold text-red-soft"
          >
            + Add link
          </button>
        )}

        <button type="button" onClick={save} disabled={busy} className="rounded-full bg-red px-4 py-3.5 text-[15px] font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : "Save links"}
        </button>
      </div>
    </div>
  );
}
