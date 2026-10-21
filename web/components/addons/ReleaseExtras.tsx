"use client";

import { useCallback, useEffect, useState } from "react";
import { zipSync } from "fflate";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { ADD_ON_KIND_LABEL, formatBytes, type AddOnKindName } from "@/lib/commerce/addOnRules";
import { AddOnsEditor, addOnDraftsError, addOnDraftsPayload, type AddOnDraft } from "@/components/addons/AddOnsEditor";

type Extra = {
  id: string;
  kind: AddOnKindName;
  title: string;
  description: string | null;
  isVideoLink: boolean;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  youtubeId: string | null;
  viewUrl: string | null;
  downloadUrl: string | null;
};

/** Fired (window event) when the viewer's ownership of a release may have changed — e.g. a free claim. */
export const OWNERSHIP_CHANGED_EVENT = "xoldout:ownership-changed";

const KIND_ICON: Record<AddOnKindName, string> = {
  MUSIC_VIDEO: "🎬",
  VISUALIZER: "🌀",
  ARTWORK: "🖼️",
  WALLPAPER: "📱",
  LYRICS: "📝",
  BOOKLET: "📖",
  BEHIND_THE_SCENES: "🎥",
  OTHER: "✨",
};

type Viewing = { kind: "youtube"; id: string; title: string } | { kind: "image" | "video"; url: string; title: string } | null;

// The release page's "Extras" (Creative Add-ons, V1.2). Everyone sees what's
// included — that's part of the pitch — but only a buyer (or the artist)
// can watch, view or download them. "Download all" zips the uploaded files
// in the fan's own browser (fflate), so bundling never costs server CPU;
// YouTube extras go in as a links file since there's no file to include.
export function ReleaseExtras({ productId, releaseTitle }: { productId: string; releaseTitle: string }) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [extras, setExtras] = useState<Extra[] | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [viewing, setViewing] = useState<Viewing>(null);
  const [zipping, setZipping] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [drafts, setDrafts] = useState<AddOnDraft[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/products/${productId}/add-ons`);
    if (!res.ok) return;
    const data = await res.json();
    setExtras(data.addOns);
    setUnlocked(data.unlocked);
    setIsCreator(data.isCreator);
  }, [productId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one fetch on mount / sign-in change, not derived render state
    void load();
    const onChanged = () => void load();
    window.addEventListener(OWNERSHIP_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(OWNERSHIP_CHANGED_EVENT, onChanged);
  }, [load, appUser?.id]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setViewing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  if (extras === null) return null;
  // The artist can still add extras to a release that has none yet.
  if (extras.length === 0 && !isCreator) return null;

  function open(x: Extra) {
    if (x.youtubeId) return setViewing({ kind: "youtube", id: x.youtubeId, title: x.title });
    if (!x.viewUrl) return;
    if (x.contentType?.startsWith("image/")) return setViewing({ kind: "image", url: x.viewUrl, title: x.title });
    if (x.contentType?.startsWith("video/")) return setViewing({ kind: "video", url: x.viewUrl, title: x.title });
    window.open(x.viewUrl, "_blank", "noopener");
  }

  async function downloadAll() {
    if (!extras) return;
    const files = extras.filter((x) => x.downloadUrl);
    const links = extras.filter((x) => x.youtubeId);
    try {
      const entries: Record<string, Uint8Array> = {};
      const used = new Set<string>();
      for (let i = 0; i < files.length; i++) {
        const x = files[i];
        setZipping(`Downloading ${i + 1} of ${files.length}…`);
        const res = await fetch(x.downloadUrl!);
        if (!res.ok) throw new Error(`Couldn't download "${x.title}"`);
        let name = x.fileName || `${x.title}`;
        while (used.has(name)) name = `${i + 1}-${name}`;
        used.add(name);
        entries[name] = new Uint8Array(await res.arrayBuffer());
      }
      if (links.length > 0) {
        const text = links.map((x) => `${x.title}\nhttps://www.youtube.com/watch?v=${x.youtubeId}\n`).join("\n");
        entries["YouTube links.txt"] = new TextEncoder().encode(text);
      }
      setZipping("Packing…");
      // level 0: images/videos/PDFs are already compressed — just bundle them.
      const zipped = zipSync(entries, { level: 0 });
      const url = URL.createObjectURL(new Blob([zipped as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${releaseTitle.replace(/[\\/:*?"<>|]/g, "").trim() || "Extras"} - Extras.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setZipping(null);
    }
  }

  async function saveNew() {
    const error = addOnDraftsError(drafts);
    if (error) return toast.error(error);
    if (drafts.length === 0) return setManaging(false);
    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${productId}/add-ons`, { method: "POST", body: JSON.stringify({ addOns: addOnDraftsPayload(drafts) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save extras");
      setExtras(data.addOns);
      setDrafts([]);
      setManaging(false);
      toast.success("Extras added.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save extras");
    } finally {
      setSaving(false);
    }
  }

  async function remove(x: Extra) {
    if (!(await toast.confirm(`Remove "${x.title}" from this release? Buyers will no longer see it.`, { confirmLabel: "Remove", destructive: true }))) return;
    const res = await apiFetch(`/api/products/${productId}/add-ons?addOnId=${x.id}`, { method: "DELETE" });
    if (res.ok) setExtras((await res.json()).addOns);
    else toast.error("Could not remove that extra");
  }

  const fileCount = extras.filter((x) => x.downloadUrl).length;

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3">
          Extras <span className="ml-1 rounded-full bg-red px-1.5 py-[1px] text-[10px] text-white">E+</span>
        </h2>
        {unlocked && fileCount > 0 && (
          <button type="button" onClick={downloadAll} disabled={zipping !== null} className="text-xs font-semibold text-red-soft disabled:opacity-60">
            {zipping ?? "Download all (.zip)"}
          </button>
        )}
      </div>
      {!unlocked && extras.length > 0 && <p className="text-xs text-ink-3 mb-2">Comes with your purchase:</p>}

      <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {extras.map((x) => (
          <div key={x.id} className="flex items-center gap-3 py-3">
            <span className="h-9 w-9 shrink-0 rounded-lg bg-surface-2 flex items-center justify-center text-lg" aria-hidden>
              {unlocked ? KIND_ICON[x.kind] : "🔒"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{x.title}</p>
              <p className="text-[11px] text-ink-3 truncate">
                {ADD_ON_KIND_LABEL[x.kind]}
                {x.isVideoLink ? " · Watch online" : x.sizeBytes ? ` · ${formatBytes(x.sizeBytes)}` : ""}
                {x.description ? ` · ${x.description}` : ""}
              </p>
            </div>
            {unlocked && (
              <div className="flex items-center gap-3 shrink-0">
                <button type="button" onClick={() => open(x)} className="text-xs font-semibold text-ink-2 hover:text-ink">
                  {x.youtubeId || x.contentType?.startsWith("video/") ? "Watch" : "View"}
                </button>
                {x.downloadUrl && (
                  <a href={x.downloadUrl} className="text-xs font-semibold text-red-soft">
                    Download
                  </a>
                )}
                {isCreator && (
                  <button type="button" onClick={() => remove(x)} aria-label={`Remove ${x.title}`} className="text-xs text-ink-3 hover:text-red-soft">
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {!unlocked && extras.length > 0 && <p className="text-[11px] text-ink-3 mt-2">Buy this release to unlock and download these extras.</p>}

      {isCreator && (
        <div className="mt-3">
          {managing ? (
            <div className="flex flex-col gap-3">
              <AddOnsEditor drafts={drafts} onChange={setDrafts} existingCount={extras.length} />
              <div className="flex gap-2">
                <button type="button" onClick={saveNew} disabled={saving} className="flex-1 rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Saving…" : "Save extras"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrafts([]);
                    setManaging(false);
                  }}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setManaging(true)} className="text-xs font-semibold text-red-soft">
              + Add extras to this release
            </button>
          )}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4" onClick={() => setViewing(null)} role="dialog" aria-modal="true">
          <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="absolute right-3 top-3 h-10 w-10 rounded-full bg-white/10 text-xl text-white">
            ✕
          </button>
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {viewing.kind === "youtube" ? (
              <div className="relative w-full aspect-video">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${viewing.id}?autoplay=1&rel=0`}
                  title={viewing.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full rounded-lg"
                />
              </div>
            ) : viewing.kind === "video" ? (
              <video src={viewing.url} controls autoPlay playsInline className="w-full max-h-[85vh] rounded-lg bg-black" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- signed R2 link, not a static asset
              <img src={viewing.url} alt={viewing.title} className="mx-auto max-h-[85vh] max-w-full object-contain" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
