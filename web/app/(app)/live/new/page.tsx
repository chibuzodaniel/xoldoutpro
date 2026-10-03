"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { BackHeader } from "@/components/ui/BackHeader";
import { useToast } from "@/components/ui/ToastProvider";
import { BottomSheet } from "@/components/live/BottomSheet";
import { BroadcastIcon } from "@/components/live/LiveIcons";

type ActiveSession = { id: string; title: string; startedAt: string };

function startedAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

type PinnableProduct ={ id: string; type: "RELEASE" | "BEAT" | "MERCH"; title: string; priceKobo: number };

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Web's Go Live form — same POST /api/live as mobile's GoLiveScreen, same
// eligibility (any signed-in user, see lib/live/sessions.ts's own comment).
// Broadcasting isn't camera-first-only-on-mobile after all (explicit ask):
// this hands off to app/(app)/live/[id]/broadcast/page.tsx, which does the
// getUserMedia capture + publish that mobile's screen does with
// @livekit/react-native.
// datetime-local wants local "YYYY-MM-DDTHH:mm" — 5 minutes from now, the earliest allowed.
function minScheduleValue() {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewLivePage() {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPaidAccess, setIsPaidAccess] = useState(false);
  const [priceXg, setPriceXg] = useState("");
  const [busy, setBusy] = useState(false);
  // Go live right away, or schedule it for later with a shareable link.
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");

  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverImageLadder, setCoverImageLadder] = useState<Record<string, string> | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);

  const [pinnableProducts, setPinnableProducts] = useState<PinnableProduct[] | null>(null);
  const [pinnedProductId, setPinnedProductId] = useState<string | null>(null);

  // The creator's still-running Live, if any — shows the "Continue / End &
  // start new" prompt instead of the form (one Live per creator at a time,
  // see lib/live/sessions.ts's startLiveSession).
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [endingActive, setEndingActive] = useState(false);

  useEffect(() => {
    apiFetch("/api/live/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.session && setActiveSession(data.session));
  }, []);

  async function handleEndAndStartNew() {
    if (!activeSession) return;
    setEndingActive(true);
    try {
      const res = await apiFetch(`/api/live/${activeSession.id}/end`, { method: "POST" });
      // 409 "Already ended" is fine here — it's over either way.
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not end your Live");
      }
      setActiveSession(null);
      toast.success("Previous Live ended — set up your new one");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEndingActive(false);
    }
  }

  useEffect(() => {
    apiFetch("/api/live/pinnable-products")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setPinnableProducts(data.products));
  }, []);

  async function handleCoverSelected(file: File) {
    setCoverPreview(URL.createObjectURL(file));
    setCoverUploading(true);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not process cover image");
      const data = await res.json();
      setCoverImageLadder(data.artworkLadder);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleStart() {
    if (!title.trim()) return toast.error("Give your Live a title");
    let scheduledFor: string | undefined;
    if (mode === "schedule") {
      const when = new Date(scheduleAt);
      if (!scheduleAt || Number.isNaN(when.getTime())) return toast.error("Pick a date and time");
      if (when.getTime() < Date.now() + 5 * 60 * 1000) return toast.error("Schedule it at least 5 minutes from now");
      scheduledFor = when.toISOString();
    }
    const price = isPaidAccess ? parseInt(priceXg, 10) : 0;
    if (isPaidAccess && (!priceXg || !Number.isInteger(price) || price <= 0)) return toast.error("Enter a valid XG price");

    setBusy(true);
    try {
      const res = await apiFetch("/api/live", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          coverImageLadder: coverImageLadder ?? undefined,
          isPaidAccess,
          priceXg: price,
          pinnedProductId: pinnedProductId ?? undefined,
          scheduledFor,
        }),
      });
      const data = await res.json();
      // Went live elsewhere (another tab/device) since this form loaded.
      if (res.status === 409 && data.activeSession) {
        setActiveSession(data.activeSession);
        setBusy(false);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not go live");
      if (scheduledFor) {
        // Lands on the Live's own link — the shareable countdown page.
        toast.success("Scheduled! Share the link so people can set a reminder.");
        router.push(`/live/${data.session.id}`);
        return;
      }
      router.push(`/live/${data.session.id}/broadcast`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="pb-10">
      <BackHeader title="Go Live" />
      <div className="px-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label="When">
          {(["now", "schedule"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-lg py-2.5 text-sm font-semibold transition-colors ${mode === m ? "bg-red text-white" : "text-ink-3"}`}
            >
              {m === "now" ? "Go live now" : "Schedule for later"}
            </button>
          ))}
        </div>

        {mode === "schedule" && (
          <div>
            <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Starts at</p>
            <input
              type="datetime-local"
              value={scheduleAt}
              min={minScheduleValue()}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red [color-scheme:dark]"
            />
            <p className="mt-1.5 text-[11px] text-ink-3">
              You get a link to share right away. Fans can set a reminder, and they plus your followers are notified the moment you start.
            </p>
          </div>
        )}

        <div>
          <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Cover image</p>
          <div className="relative h-32 w-full">
            <label className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-ink-3">Optional — add a cover image</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setCoverCropFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            {coverPreview && !coverUploading && (
              <button
                type="button"
                onClick={() => {
                  setCoverPreview(null);
                  setCoverImageLadder(null);
                }}
                aria-label="Remove cover image"
                className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
              >
                ×
              </button>
            )}
          </div>
          {coverUploading && <p className="text-xs text-ink-3 mt-1">Processing cover…</p>}
          {coverCropFile && (
            <ImageCropModal
              file={coverCropFile}
              aspect={1}
              outputWidth={1024}
              outputHeight={1024}
              onCancel={() => setCoverCropFile(null)}
              onConfirm={(cropped) => {
                setCoverCropFile(null);
                handleCoverSelected(cropped);
              }}
            />
          )}
        </div>

        <div>
          <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Title</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's this Live about?"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
        </div>

        <div>
          <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Description</p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red resize-none"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsPaidAccess((v) => !v)}
          className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5"
        >
          <span className="text-sm font-semibold">Paid access</span>
          <span
            className={`inline-flex h-6 w-11 items-center rounded-full px-0.5 transition-colors duration-150 ${
              isPaidAccess ? "bg-red justify-end" : "bg-surface-2 justify-start"
            }`}
          >
            <span className="h-5 w-5 rounded-full bg-white" />
          </span>
        </button>

        {isPaidAccess && (
          <div>
            <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Price to join (XG)</p>
            <input
              value={priceXg}
              onChange={(e) => setPriceXg(e.target.value)}
              type="number"
              min={1}
              placeholder="e.g. 100"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
        )}

        {pinnableProducts && pinnableProducts.length > 0 && (
          <div>
            <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">Pin a product (optional)</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setPinnedProductId(null)}
                className={`text-left rounded-lg border px-3 py-2.5 text-sm ${
                  pinnedProductId === null ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"
                }`}
              >
                None
              </button>
              {pinnableProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPinnedProductId(p.id)}
                  className={`text-left rounded-lg border px-3 py-2.5 text-sm flex items-center justify-between ${
                    pinnedProductId === p.id ? "border-red bg-red/10 text-red-soft" : "border-line text-ink-2"
                  }`}
                >
                  <span className="truncate">{p.title}</span>
                  <span className="shrink-0 ml-2 text-xs">{formatNaira(p.priceKobo)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={busy}
          className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 mt-2"
        >
          {busy ? (mode === "schedule" ? "Scheduling…" : "Starting…") : mode === "schedule" ? "Schedule Live" : "Go Live"}
        </button>
      </div>

      {activeSession && (
        <BottomSheet onClose={() => router.back()}>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red/15 text-red-soft">
              <BroadcastIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[24px] leading-tight">You&apos;re already live</h2>
              <p className="truncate text-[13px] text-ink-3">
                &ldquo;{activeSession.title}&rdquo; · started {startedAgo(activeSession.startedAt)}
              </p>
            </div>
          </div>
          <p className="mb-5 text-[14px] text-ink-2">Continue where you left off, or end that Live and start a new one.</p>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => router.push(`/live/${activeSession.id}/broadcast`)}
              disabled={endingActive}
              className="rounded-xl bg-red px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              Continue live
            </button>
            <button
              onClick={handleEndAndStartNew}
              disabled={endingActive}
              className="rounded-xl border border-line px-4 py-3.5 text-[15px] font-semibold text-ink disabled:opacity-50"
            >
              {endingActive ? "Ending…" : "End it & start new"}
            </button>
            <button onClick={() => router.back()} disabled={endingActive} className="py-2 text-[13px] text-ink-3">
              Cancel
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
