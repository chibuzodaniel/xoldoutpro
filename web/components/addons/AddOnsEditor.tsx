"use client";

import { ADD_ON_KINDS, ADD_ON_KIND_LABEL, MAX_ADD_ONS_PER_PRODUCT, VIDEO_KINDS, formatBytes, parseYouTubeId, type AddOnKindName } from "@/lib/commerce/addOnRules";
import { uploadAddOnFile } from "@/lib/uploadAddOn";

export type AddOnDraft = {
  localId: string;
  kind: AddOnKindName;
  title: string;
  description: string;
  source: "youtube" | "file";
  youtubeUrl: string;
  status: "idle" | "uploading" | "ready" | "error";
  progress: number;
  fileKey?: string;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  error?: string;
};

export function newAddOnDraft(): AddOnDraft {
  return { localId: crypto.randomUUID(), kind: "MUSIC_VIDEO", title: "", description: "", source: "youtube", youtubeUrl: "", status: "idle", progress: 0 };
}

/** Problems that should block publishing, or null when every extra is complete. */
export function addOnDraftsError(drafts: AddOnDraft[]): string | null {
  for (const d of drafts) {
    const label = d.title.trim() || ADD_ON_KIND_LABEL[d.kind];
    if (!d.title.trim()) return "Give every extra a title";
    if (d.source === "youtube" && !parseYouTubeId(d.youtubeUrl)) return `"${label}": paste a valid YouTube link`;
    if (d.source === "file" && d.status === "uploading") return `"${label}" is still uploading`;
    if (d.source === "file" && d.status !== "ready") return `"${label}": add a file`;
  }
  return null;
}

/** The API payload for drafts (validated with addOnDraftsError first). */
export function addOnDraftsPayload(drafts: AddOnDraft[]) {
  return drafts.map((d) =>
    d.source === "youtube"
      ? { kind: d.kind, title: d.title.trim(), description: d.description.trim() || undefined, youtubeUrl: d.youtubeUrl.trim() }
      : { kind: d.kind, title: d.title.trim(), description: d.description.trim() || undefined, fileKey: d.fileKey, fileName: d.fileName, contentType: d.contentType },
  );
}

const inputClass = "rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red";

// The optional "Extras" section of the music upload (Creative Add-ons, V1.2)
// — also reused on a release's own page for adding extras later. Each extra
// gets a type, title, short description, and either a YouTube link
// (preferred for videos, per the explicit ask) or an uploaded file ≤100 MB.
export function AddOnsEditor({
  drafts,
  onChange,
  existingCount = 0,
}: {
  drafts: AddOnDraft[];
  onChange: (updater: (cur: AddOnDraft[]) => AddOnDraft[]) => void;
  existingCount?: number;
}) {
  const update = (localId: string, patch: Partial<AddOnDraft>) =>
    onChange((cur) => cur.map((d) => (d.localId === localId ? { ...d, ...patch } : d)));
  const canAdd = existingCount + drafts.length < MAX_ADD_ONS_PER_PRODUCT;

  async function pickFile(draft: AddOnDraft, file: File) {
    update(draft.localId, { status: "uploading", progress: 0, error: undefined, fileName: file.name, contentType: file.type, sizeBytes: file.size });
    try {
      const key = await uploadAddOnFile(file, (p) => update(draft.localId, { progress: p }));
      update(draft.localId, { status: "ready", fileKey: key, progress: 1 });
    } catch (err) {
      update(draft.localId, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((d, i) => (
        <div key={d.localId} className="rounded-xl border border-line-soft bg-surface p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-widest text-ink-3">Extra {existingCount + i + 1}</span>
            <button type="button" onClick={() => onChange((cur) => cur.filter((x) => x.localId !== d.localId))} className="text-xs text-ink-3 hover:text-red-soft">
              Remove
            </button>
          </div>

          <select
            value={d.kind}
            onChange={(e) => {
              const kind = e.target.value as AddOnKindName;
              // Video types start on the (preferred) YouTube option; the rest are uploads.
              update(d.localId, { kind, ...(d.status === "idle" && !d.youtubeUrl ? { source: VIDEO_KINDS.has(kind) ? "youtube" : "file" } : {}) });
            }}
            className={inputClass}
          >
            {ADD_ON_KINDS.map((k) => (
              <option key={k} value={k}>
                {ADD_ON_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input value={d.title} onChange={(e) => update(d.localId, { title: e.target.value })} placeholder="Title, e.g. Official music video" maxLength={120} className={inputClass} />
          <input
            value={d.description}
            onChange={(e) => update(d.localId, { description: e.target.value })}
            placeholder="Short description (optional)"
            maxLength={500}
            className={inputClass}
          />

          <div className="flex gap-2">
            {(["youtube", "file"] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => update(d.localId, { source: src })}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${d.source === src ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2"}`}
              >
                {src === "youtube" ? "YouTube link" : "Upload file"}
              </button>
            ))}
          </div>

          {d.source === "youtube" ? (
            <>
              <input
                value={d.youtubeUrl}
                onChange={(e) => update(d.localId, { youtubeUrl: e.target.value })}
                placeholder="https://youtu.be/…"
                inputMode="url"
                className={inputClass}
              />
              <p className="text-[11px] text-ink-3">
                <span className="text-green font-semibold">Recommended for videos.</span> Nothing to upload, and it plays instantly for fans. Tip: set the
                video to Unlisted on YouTube so only buyers find it here.
              </p>
            </>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-line px-3 py-2.5 cursor-pointer">
                <span className="text-sm text-ink-2 truncate">
                  {d.fileName ? `${d.fileName}${d.sizeBytes ? ` · ${formatBytes(d.sizeBytes)}` : ""}` : "Choose an image, video, PDF or text file"}
                </span>
                <span className="text-xs font-semibold text-red-soft shrink-0">{d.fileName ? "Change" : "Browse"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,application/pdf,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void pickFile(d, file);
                    e.target.value = "";
                  }}
                />
              </label>
              {d.status === "uploading" && (
                <div className="h-1.5 rounded-full bg-line-soft overflow-hidden">
                  <div className="h-full bg-red transition-[width] duration-150" style={{ width: `${Math.round(d.progress * 100)}%` }} />
                </div>
              )}
              {d.status === "ready" && <p className="text-[11px] text-green">Uploaded</p>}
              {d.error && <p className="text-[11px] text-red-soft">{d.error}</p>}
              <p className="text-[11px] text-ink-3">
                Up to 100 MB. For music videos, a YouTube link is preferred — uploads are best for artwork, wallpapers, lyrics, booklets and short clips.
              </p>
            </>
          )}
        </div>
      ))}

      {canAdd && (
        <button
          type="button"
          onClick={() => onChange((cur) => [...cur, newAddOnDraft()])}
          className="rounded-lg border border-dashed border-line px-4 py-2.5 text-sm font-semibold text-ink-2 hover:border-line-strong hover:text-ink"
        >
          + Add an extra
        </button>
      )}
    </div>
  );
}
