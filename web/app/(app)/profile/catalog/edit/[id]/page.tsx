"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ChipPicker } from "@/components/publish/ChipPicker";
import { TagPicker } from "@/components/music/TagPicker";
import { LicenseTiersEditor, tiersPayload, tiersFromPresets, type TierDraft } from "@/components/beats/LicenseTiersEditor";
import { VariantsEditor, variantsPayload, type VariantsState } from "@/components/merch/VariantsEditor";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { uploadImage } from "@/lib/uploadImage";
import { BEAT_GENRES, BEAT_MOODS, MERCH_CATEGORIES } from "@/lib/discover/sectionFilters";
import { licensePresets, type LicenseTerms } from "@/lib/commerce/licenseTerms";

// Edit release (explicit ask, 2026-11-11): one screen for a seller's own
// music, beat or merch listing, so older listings can be moved onto the
// current structure without deleting or re-uploading. Fields depend on the
// product type. Structure (genres, release type, beat details and licenses,
// merch category and sizes/colours) can change any time; name, price, cover
// and description follow the edit window, with one extra upgrade edit for
// listings published before 12 Nov 2026 (lib/editWindow.ts).

type Loaded = {
  product: {
    id: string;
    type: "RELEASE" | "BEAT" | "MERCH";
    title: string;
    description: string | null;
    priceKobo: number;
    payWhatYouWant: boolean;
    release: { releaseType: "SINGLE" | "EP" | "ALBUM"; genres: string[]; artworkLadder: Record<string, string> | null; _count: { tracks: number } } | null;
    beat: { genre: string | null; mood: string | null; bpm: number | null; musicalKey: string | null; tags: string[]; coverImageLadder: Record<string, string> | null } | null;
    beatLicenses: { id: string; name: string; priceKobo: number; formats: string[]; isExclusive: boolean; terms: LicenseTerms; _count: { orderItems: number } }[];
    merchItem: { category: string | null; sizeGuide: string | null; shippingFeeKobo: number; imageLadder: Record<string, string> | null } | null;
    merchVariants: { id: string; size: string | null; color: string | null; cap: number | null; sold: number; reserved: number }[];
  };
  listingEdit: "open" | "upgrade" | "closed";
  editWindowHours: number;
};

const PATHS = { RELEASE: "r", BEAT: "b", MERCH: "m" } as const;
const API = { RELEASE: "releases", BEAT: "beats", MERCH: "merch" } as const;
const NOUN = { RELEASE: "release", BEAT: "beat", MERCH: "listing" } as const;

const label = "text-[12px] uppercase tracking-widest text-ink-3";
const field = "rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red disabled:opacity-60";
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 disabled:opacity-40 ${on ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"}`;

function variantsStateFrom(rows: Loaded["product"]["merchVariants"]): VariantsState {
  const sizes = [...new Set(rows.map((r) => r.size).filter((x): x is string => Boolean(x)))];
  const colors = [...new Set(rows.map((r) => r.color).filter((x): x is string => Boolean(x)))];
  const stock: Record<string, string> = {};
  for (const r of rows) stock[`${r.size ?? ""}|${r.color ?? ""}`] = r.cap === null ? "" : String(r.cap);
  return { sizes, colors, stock };
}

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { appUser } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Listing fields (window-limited)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [newLadder, setNewLadder] = useState<Record<string, string> | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  // Music
  const [releaseType, setReleaseType] = useState<"SINGLE" | "EP" | "ALBUM">("SINGLE");
  const [genres, setGenres] = useState<string[]>([]);
  // Beat
  const [beatGenre, setBeatGenre] = useState<string | null>(null);
  const [beatMood, setBeatMood] = useState<string | null>(null);
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [tags, setTags] = useState("");
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  // Merch
  const [category, setCategory] = useState<string | null>(null);
  const [sizeGuide, setSizeGuide] = useState("");
  const [variants, setVariants] = useState<VariantsState>({ sizes: [], colors: [], stock: {} });

  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    apiFetch(`/api/products/${id}/edit`).then(async (res) => {
      if (cancelled) return;
      if (!res.ok) return setMissing(true);
      const d: Loaded = await res.json();
      const p = d.product;
      setData(d);
      setTitle(p.title);
      setDescription(p.description ?? "");
      setPrice(String(p.priceKobo / 100));
      setCoverPreview(p.release?.artworkLadder?.["1024"] ?? p.beat?.coverImageLadder?.["1024"] ?? p.merchItem?.imageLadder?.["1024"] ?? null);
      if (p.release) {
        setReleaseType(p.release.releaseType);
        setGenres(p.release.genres);
      }
      if (p.beat) {
        setBeatGenre(p.beat.genre);
        setBeatMood(p.beat.mood);
        setBpm(p.beat.bpm ? String(p.beat.bpm) : "");
        setMusicalKey(p.beat.musicalKey ?? "");
        setTags(p.beat.tags.join(", "));
        // Existing tiers keep their id as the key; a beat with none starts
        // from the presets, all off, so nothing changes until they're switched on.
        setTiers(
          p.beatLicenses.length
            ? p.beatLicenses.map((l) => ({ ...l, key: l.id, enabled: true, priceText: String(l.priceKobo / 100) }))
            : tiersFromPresets(licensePresets(appUser.displayName)).map((t) => ({ ...t, enabled: false })),
        );
      }
      if (p.merchItem) {
        setCategory(p.merchItem.category);
        setSizeGuide(p.merchItem.sizeGuide ?? "");
        setVariants(variantsStateFrom(p.merchVariants));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, appUser]);

  if (missing) {
    return (
      <div className="pb-24">
        <BackHeader title="Edit" />
        <p className="px-4 text-sm text-ink-3">{"This listing can't be edited — it may have been deleted, or it isn't yours."}</p>
      </div>
    );
  }
  if (!data) return <LoadingSpinner full size="lg" />;

  const p = data.product;
  const listingOpen = data.listingEdit !== "closed";

  async function onCover(file: File) {
    setCoverPreview(URL.createObjectURL(file));
    setCoverBusy(true);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not process the cover");
      setNewLadder((await res.json()).artworkLadder);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setCoverBusy(false);
    }
  }

  async function save() {
    const body: Record<string, unknown> = {};
    // Listing fields: only what changed, and only while editable.
    if (listingOpen) {
      if (title.trim() && title.trim() !== p.title) body.title = title.trim();
      if (description !== (p.description ?? "")) body.description = description;
      const kobo = Math.round(parseFloat(price || "0") * 100);
      const priced = !(p.type === "BEAT" && tiers.some((t) => t.enabled));
      if (priced && kobo !== p.priceKobo) {
        if (!Number.isFinite(kobo) || kobo < 0) return toast.error("Enter a valid price");
        body.priceKobo = kobo;
      }
      if (newLadder && p.type === "RELEASE") body.artworkLadder = newLadder;
    }
    if (p.type === "RELEASE") {
      if (releaseType !== p.release?.releaseType) body.releaseType = releaseType;
      if (genres.length === 0) return toast.error("Pick at least one genre");
      if (genres.join() !== (p.release?.genres ?? []).join()) body.genres = genres;
    }
    if (p.type === "BEAT") {
      body.genre = beatGenre;
      body.mood = beatMood;
      const n = bpm.trim() ? Number(bpm) : null;
      if (n !== null && (!Number.isInteger(n) || n < 20 || n > 400)) return toast.error("BPM should be a whole number between 20 and 400");
      body.bpm = n;
      body.musicalKey = musicalKey.trim() || null;
      body.tags = tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 8);
      const on = tiers.filter((t) => t.enabled);
      if (on.length || p.beatLicenses.length) {
        if (on.length) {
          const result = tiersPayload(tiers);
          if ("error" in result) return toast.error(result.error);
          const ids = new Set(p.beatLicenses.map((l) => l.id));
          body.licenses = result.licenses.map((l, i) => (ids.has(on[i].key) ? { ...l, id: on[i].key } : l));
        } else {
          body.licenses = [];
        }
      }
    }
    if (p.type === "MERCH") {
      body.category = category;
      body.sizeGuide = sizeGuide.trim() || null;
      const result = variantsPayload(variants);
      if ("error" in result) return toast.error(result.error);
      body.variants = result.variants;
    }

    if (data?.listingEdit === "upgrade" && ["title", "description", "priceKobo", "artworkLadder"].some((k) => k in body)) {
      const ok = await toast.confirm(
        `This uses your one-time upgrade edit. Name, price, cover and description stay editable for ${data.editWindowHours} hours after this save, then lock.`,
        { confirmLabel: "Save" },
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`/api/${API[p.type]}/${p.id}`, { method: "PATCH", body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : Array.isArray(d.error) ? (d.error[0]?.message ?? "Could not save") : "Could not save");
      toast.success("Saved.");
      router.push(`/${PATHS[p.type]}/${p.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const noun = NOUN[p.type];
  const lockNote =
    data.listingEdit === "upgrade"
      ? `Older ${noun}s get one upgrade edit: your first save of name, price${p.type === "RELEASE" ? ", cover" : ""} or description opens a ${data.editWindowHours}-hour window, then they lock.`
      : data.listingEdit === "closed"
        ? `Name, price${p.type === "RELEASE" ? ", cover" : ""} and description are locked. Everything below can still change.`
        : null;

  return (
    <div className="pb-28">
      <BackHeader title={`Edit ${noun}`} />
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-4">
        <p className="text-sm text-ink-3">
          Update this {noun} to the new XOLDOUT layout. Buyers keep what they already bought — files are never changed here.
        </p>

        <section className="flex flex-col gap-4 rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold">Details</h2>
            {!listingOpen && <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-3">Locked</span>}
          </div>
          {lockNote && <p className="text-xs text-ink-3">{lockNote}</p>}

          {p.type === "RELEASE" && (
            <div className="flex items-center gap-3">
              <span className="h-20 w-20 overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                {coverPreview && <img src={coverPreview} alt="" className="h-full w-full object-cover" />}
              </span>
              {listingOpen && (
                <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 hover:border-line-strong">
                  {coverBusy ? "Processing…" : "Change cover"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setCropFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className={label}>Name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={!listingOpen} className={field} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} disabled={!listingOpen} className={`${field} resize-none`} />
          </label>
          {!(p.type === "BEAT" && tiers.some((t) => t.enabled)) && (
            <label className="flex flex-col gap-1">
              <span className={label}>{p.payWhatYouWant ? "Minimum price (₦)" : "Price (₦)"}</span>
              <input type="number" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!listingOpen} className={`${field} w-40`} />
            </label>
          )}
        </section>

        {p.type === "RELEASE" && (
          <section className="flex flex-col gap-4 rounded-2xl border border-line p-4">
            <h2 className="text-[15px] font-bold">Music settings</h2>
            <div className="flex flex-col gap-2">
              <span className={label}>Release type</span>
              <div className="flex flex-wrap gap-2">
                {(["SINGLE", "EP", "ALBUM"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setReleaseType(t)}
                    disabled={t === "SINGLE" && (p.release?._count.tracks ?? 0) !== 1}
                    className={chip(releaseType === t)}
                  >
                    {t === "SINGLE" ? "Single" : t === "EP" ? "EP" : "Album"}
                  </button>
                ))}
              </div>
              {(p.release?._count.tracks ?? 0) !== 1 && <p className="text-[11px] text-ink-3">A single has exactly one track.</p>}
            </div>
            <TagPicker genres={genres} onGenres={setGenres} />
          </section>
        )}

        {p.type === "BEAT" && (
          <>
            <section className="flex flex-col gap-4 rounded-2xl border border-line p-4">
              <h2 className="text-[15px] font-bold">Beat details</h2>
              <ChipPicker label="Genre" options={BEAT_GENRES} value={beatGenre} onChange={setBeatGenre} />
              <ChipPicker label="Mood" options={BEAT_MOODS} value={beatMood} onChange={setBeatMood} />
              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className={label}>BPM</span>
                  <input type="number" min={20} max={400} value={bpm} onChange={(e) => setBpm(e.target.value)} className={field} />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className={label}>Key</span>
                  <input value={musicalKey} onChange={(e) => setMusicalKey(e.target.value.slice(0, 10))} placeholder="e.g. A minor" className={field} />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className={label}>Tags</span>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="afro, summer, bounce" className={field} />
              </label>
            </section>
            <section className="flex flex-col gap-3 rounded-2xl border border-line p-4">
              <h2 className="text-[15px] font-bold">Licensing</h2>
              <p className="text-xs text-ink-3">
                Switch on the licenses you want to sell. Buyers keep the terms they bought; a license someone bought can be edited but not removed.
                {p.beatLicenses.length === 0 && " With none switched on, the beat keeps its single price."}
              </p>
              <LicenseTiersEditor tiers={tiers} onChange={setTiers} />
            </section>
          </>
        )}

        {p.type === "MERCH" && (
          <section className="flex flex-col gap-4 rounded-2xl border border-line p-4">
            <h2 className="text-[15px] font-bold">Product options</h2>
            <ChipPicker label="Category" options={MERCH_CATEGORIES} value={category} onChange={setCategory} />
            <div className="flex flex-col gap-2">
              <span className={label}>Sizes and colours</span>
              <VariantsEditor value={variants} onChange={setVariants} />
              <p className="text-[11px] text-ink-3">{"Options with orders can't be removed, and their stock can't go below what's sold."}</p>
            </div>
            {variants.sizes.length > 0 && (
              <label className="flex flex-col gap-1">
                <span className={label}>Size guide (optional)</span>
                <textarea value={sizeGuide} onChange={(e) => setSizeGuide(e.target.value)} maxLength={1000} rows={3} className={`${field} resize-none`} />
              </label>
            )}
          </section>
        )}

        <button type="button" onClick={save} disabled={saving || coverBusy} className="rounded-full bg-red px-4 py-3.5 text-[15px] font-bold text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save changes"}
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
            onCover(cropped);
          }}
        />
      )}
    </div>
  );
}
