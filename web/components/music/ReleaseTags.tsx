"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { genreLabel, moodLabel, MOODS } from "@/lib/music/tags";
import { TagPicker } from "./TagPicker";

// A release's genres/moods on its own page (Music tab, V1.2). Each chip opens
// the Music tab filtered to it. The artist can add or change them any time —
// releases from before genres existed get an "Add genre & mood" prompt,
// since untagged releases only show under "All" in the Music tab.
export function ReleaseTags({
  productId,
  creatorId,
  initialGenres,
  initialMoods,
}: {
  productId: string;
  creatorId: string;
  initialGenres: string[];
  initialMoods: string[];
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [genres, setGenres] = useState(initialGenres);
  const [moods, setMoods] = useState(initialMoods);
  const [editing, setEditing] = useState(false);
  const [draftGenres, setDraftGenres] = useState(initialGenres);
  const [draftMoods, setDraftMoods] = useState(initialMoods);
  const [saving, setSaving] = useState(false);
  const isCreator = appUser?.id === creatorId;

  async function save() {
    if (draftGenres.length === 0) return toast.error("Pick at least one genre");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/releases/${productId}/tags`, { method: "PUT", body: JSON.stringify({ genres: draftGenres, moods: draftMoods }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save");
      setGenres(data.genres);
      setMoods(data.moods);
      setEditing(false);
      toast.success("Genre & mood saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-line-soft bg-surface p-3 mb-5 flex flex-col gap-3">
        <TagPicker genres={draftGenres} moods={draftMoods} onGenres={setDraftGenres} onMoods={setDraftMoods} />
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={saving} className="flex-1 rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-2">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (genres.length === 0 && moods.length === 0) {
    if (!isCreator) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setDraftGenres(genres);
          setDraftMoods(moods);
          setEditing(true);
        }}
        className="mb-5 w-full rounded-xl border border-dashed border-red/60 px-3 py-2.5 text-left text-xs text-ink-2"
      >
        <span className="font-semibold text-red-soft">+ Add genre &amp; mood</span> — so fans can find this in the Music tab.
      </button>
    );
  }

  const chip = "rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:border-line-strong hover:text-ink";
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      {genres.map((g) => (
        <Link key={g} href={`/discover?type=RELEASE&genre=${g}`} className={chip}>
          {genreLabel(g)}
        </Link>
      ))}
      {moods.map((m) => (
        <Link key={m} href={`/discover?type=RELEASE&mood=${m}`} className={chip}>
          <span className="mr-1" aria-hidden>
            {MOODS.find((x) => x.slug === m)?.icon}
          </span>
          {moodLabel(m)}
        </Link>
      ))}
      {isCreator && (
        <button
          type="button"
          onClick={() => {
            setDraftGenres(genres);
            setDraftMoods(moods);
            setEditing(true);
          }}
          className="text-[11px] font-semibold text-red-soft ml-1"
        >
          Edit
        </button>
      )}
    </div>
  );
}
