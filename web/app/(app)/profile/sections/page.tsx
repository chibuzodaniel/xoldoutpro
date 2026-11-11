"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";
import { PROFILE_SECTIONS, readSections, type ProfileSectionKey, type ProfileSections } from "@/lib/profile/sections";

// Profile sections (v2, design/v2-prototype): choose what visitors see on
// your public page. Each switch saves straight away.
export default function ProfileSectionsPage() {
  const toast = useToast();
  const { appUser, refreshAppUser } = useAuth();
  const [sections, setSections] = useState<ProfileSections | null>(null);
  const [location, setLocation] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- seed the form once the user loads */
  useEffect(() => {
    if (!appUser || sections) return;
    const u = appUser as unknown as { profileSections?: unknown; profileLocation?: string | null };
    setSections(readSections(u.profileSections));
    setLocation(u.profileLocation ?? "");
  }, [appUser, sections]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save(patch: Record<string, unknown>) {
    const res = await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify(patch) }).catch(() => null);
    if (!res?.ok) {
      toast.error("Couldn't save");
      return false;
    }
    refreshAppUser?.();
    return true;
  }

  async function toggle(k: ProfileSectionKey) {
    if (!sections) return;
    const next = { ...sections, [k]: !sections[k] };
    setSections(next);
    if (!(await save({ profileSections: { [k]: next[k] } }))) setSections(sections);
  }

  async function saveLocation() {
    setSavingLocation(true);
    if (await save({ profileLocation: location.trim() || null })) toast.success("Location saved");
    setSavingLocation(false);
  }

  if (!appUser || !sections) return <LoadingSpinner full size="lg" />;

  return (
    <div className="pb-24">
      <BackHeader title="Profile sections" />
      <div className="mx-auto flex max-w-xl flex-col px-4">
        <p className="mb-2 text-sm text-ink-3">Choose what visitors see on your public page.</p>
        {PROFILE_SECTIONS.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4 border-t border-line-soft py-4">
            <span>
              <span className="block font-semibold">{s.label}</span>
              <span className="block text-xs text-ink-3">{s.sub}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={sections[s.key]}
              aria-label={s.label}
              onClick={() => toggle(s.key)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${sections[s.key] ? "bg-red" : "border border-line bg-surface-2"}`}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${sections[s.key] ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        ))}
        <label className="mt-2 text-sm text-ink-3" htmlFor="profile-location">
          Location
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="profile-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={60}
            placeholder="e.g. Lagos, Nigeria"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-red"
          />
          <button type="button" onClick={saveLocation} disabled={savingLocation} className="shrink-0 rounded-xl border border-line px-4 text-sm font-bold disabled:opacity-50">
            {savingLocation ? "Saving…" : "Save"}
          </button>
        </div>
        <Link href={`/u/${appUser.handle}`} className="mt-8 rounded-full bg-red px-5 py-4 text-center text-[16px] font-bold text-white">
          Preview public profile
        </Link>
      </div>
    </div>
  );
}
