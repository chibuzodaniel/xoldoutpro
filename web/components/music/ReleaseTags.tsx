"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { uploadImage } from "@/lib/uploadImage";
import { genreLabel } from "@/lib/music/tags";
import { isWithinEditWindow, EDIT_WINDOW_HOURS } from "@/lib/editWindow";
import { TagPicker } from "./TagPicker";

// A release's genre chips on its own page, plus the artist's Edit button.
// Edit is a general release editor (explicit ask, 2026-11-04): cover, name,
// price, description and genres, saved in one PATCH /api/releases/[id].
// Name/price/cover/description follow the existing edit window
// (lib/editWindow.ts); genres stay editable any time.
export function ReleaseTags({
  productId,
  creatorId,
  initialGenres,
  title,
  description,
  priceKobo,
  artworkUrl,
  publishedAt,
}: {
  productId: string;
  creatorId: string;
  initialGenres: string[];
  title: string;
  description: string | null;
  priceKobo: number;
  artworkUrl: string | null;
  publishedAt: string | null;
}) {
  const { appUser } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [genres, setGenres] = useState(initialGenres);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draftGenres, setDraftGenres] = useState(initialGenres);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [draftPrice, setDraftPrice] = useState(String(priceKobo / 100));
  const [coverPreview, setCoverPreview] = useState<string | null>(artworkUrl);
  const [newLadder, setNewLadder] = useState<Record<string, string> | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const isCreator = appUser?.id === creatorId;
  const windowOpen = isWithinEditWindow(publishedAt);
  const closesAt = publishedAt ? new Date(new Date(publishedAt).getTime() + EDIT_WINDOW_HOURS * 3600_000) : null;

  function startEditing() {
    setDraftGenres(genres);
    setDraftTitle(title);
    setDraftDescription(description ?? "");
    setDraftPrice(String(priceKobo / 100));
    setCoverPreview(artworkUrl);
    setNewLadder(null);
    setEditing(true);
  }

  async function handleCover(file: File) {
    setCoverPreview(URL.createObjectURL(file));
    setCoverBusy(true);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not process the cover");
      setNewLadder((await res.json()).artworkLadder);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cover upload failed");
      setCoverPreview(artworkUrl);
    } finally {
      setCoverBusy(false);
    }
  }

  async function save() {
    if (draftGenres.length === 0) return toast.error("Pick at least one genre");
    const body: Record<string, unknown> = {};
    if (JSON.stringify([...draftGenres].sort()) !== JSON.stringify([...genres].sort())) body.genres = draftGenres;
    if (windowOpen) {
      const nextTitle = draftTitle.trim();
      if (!nextTitle) return toast.error("Give the release a name");
      const nextPrice = Math.round(parseFloat(draftPrice || "0") * 100);
      if (Number.isNaN(nextPrice) || nextPrice < 0) return toast.error("Enter a valid price, or 0 for free");
      if (nextTitle !== title) body.title = nextTitle;
      if (draftDescription !== (description ?? "")) body.description = draftDescription;
      if (nextPrice !== priceKobo) body.priceKobo = nextPrice;
      if (newLadder) body.artworkLadder = newLadder;
    }
    if (Object.keys(body).length === 0) return setEditing(false);

    setSaving(true);
    try {
      const res = await apiFetch(`/api/releases/${productId}`, { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save");
      setGenres(data.product?.release?.genres ?? draftGenres);
      setEditing(false);
      toast.success("Release updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    const input = "w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-red disabled:opacity-50";
    return (
      <div className="rounded-xl border border-line-soft bg-surface p-4 mb-5 flex flex-col gap-4">
        <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Edit release</p>

        {windowOpen ? (
          <>
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 rounded-lg overflow-hidden bg-surface-2 shrink-0">
                {coverPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPreview} alt="Cover" className="h-full w-full object-cover" />
                )}
                {coverBusy && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white">Uploading…</div>}
              </div>
              <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 hover:border-line-strong">
                Change cover
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setCropFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] uppercase tracking-widest text-ink-3">Name</span>
              <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value.slice(0, 200))} className={input} />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] uppercase tracking-widest text-ink-3">Price (₦) — 0 for free</span>
              <input value={draftPrice} onChange={(e) => setDraftPrice(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={input} />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[12px] uppercase tracking-widest text-ink-3">Description</span>
              <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value.slice(0, 2000))} rows={3} className={input} />
            </label>

            {closesAt && (
              <p className="text-[11px] text-ink-3">
                Name, price, cover and description can be changed until{" "}
                {closesAt.toLocaleString("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit" })}.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-ink-3">
            Name, price, cover and description can only be changed in the first {EDIT_WINDOW_HOURS} hours after release. You can still change the genre.
          </p>
        )}

        <TagPicker genres={draftGenres} onGenres={setDraftGenres} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || coverBusy}
            className="flex-1 rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-2">
            Cancel
          </button>
        </div>

        {cropFile && (
          <ImageCropModal
            file={cropFile}
            aspect={1}
            outputWidth={1024}
            outputHeight={1024}
            onCancel={() => setCropFile(null)}
            onConfirm={(cropped) => {
              setCropFile(null);
              handleCover(cropped);
            }}
          />
        )}
      </div>
    );
  }

  if (genres.length === 0 && !isCreator) return null;

  const chip = "rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-2 hover:border-line-strong hover:text-ink";
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      {genres.map((g) => (
        <Link key={g} href={`/discover?type=RELEASE&genre=${g}`} className={chip}>
          {genreLabel(g)}
        </Link>
      ))}
      {isCreator && genres.length === 0 && <span className="text-xs text-ink-3 mr-1">Add a genre so fans can find this in the Music tab.</span>}
      {isCreator && (
        <button
          type="button"
          onClick={startEditing}
          className="flex items-center gap-1.5 rounded-full border border-red/60 px-3 py-1 text-[11px] font-semibold text-red-soft hover:border-red"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden>
            <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
          </svg>
          Edit release
        </button>
      )}
    </div>
  );
}
