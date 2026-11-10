"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import type { FeedPost } from "./PostCard";
import { useToast } from "@/components/ui/ToastProvider";
import { ImageCropModal } from "@/components/upload/ImageCropModal";

const MAX_LEN = 500;

type Attached = { type: "product" | "event"; id: string; title: string };
type SearchHit = { id: string; title: string; type: string; creator: { displayName: string } };

export function PostComposer({
  onPosted,
  className = "border-b border-line-soft pb-4 mb-4",
}: {
  onPosted: (post: FeedPost) => void;
  className?: string;
}) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Socials v2 (design/v2-prototype): who can see it + an attached item.
  const [audience, setAudience] = useState<"EVERYONE" | "FOLLOWERS">("EVERYONE");
  const [attached, setAttached] = useState<Attached | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  // "Post to Socials" from a product/event: /socials?compose=1&attach=product:<id>&attachTitle=…
  /* eslint-disable react-hooks/set-state-in-effect -- one-time read of the URL */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get("attach");
    const [type, id] = raw?.split(":") ?? [];
    if ((type === "product" || type === "event") && id) setAttached({ type, id, title: sp.get("attachTitle") ?? "Attached item" });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!pickerOpen || query.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((res) => (res.ok ? res.json() : { products: [] }))
        .then((d) => !cancelled && setHits(d.products ?? []))
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, pickerOpen]);

  function handleFileSelected(file: File) {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleRemoveImage() {
    if (!await toast.confirm("This photo will be permanently deleted. Continue?", { confirmLabel: "Delete", destructive: true })) return;
    clearImage();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const key = await uploadImage(imageFile, "artwork");
        const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
        if (!res.ok) throw new Error("Could not process photo");
        const data = await res.json();
        imageUrl = (data.artworkLadder as Record<string, string>)["1024"];
      }

      const res = await apiFetch("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          body: trimmed,
          imageUrl,
          audience,
          attachedProductId: attached?.type === "product" ? attached.id : undefined,
          attachedEventId: attached?.type === "event" ? attached.id : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not publish post");
      }
      const data = await res.json();
      onPosted(data.post);
      setBody("");
      clearImage();
      setAttached(null);
      setAudience("EVERYONE");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_LEN))}
        placeholder="Share an update with your fans…"
        rows={2}
        className="w-full resize-none bg-transparent text-sm placeholder:text-ink-3 focus:outline-none"
      />
      {imagePreview && (
        <div className="relative mt-2 h-32 w-32 rounded-lg overflow-hidden bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={handleRemoveImage}
            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
            aria-label="Delete photo"
          >
            ×
          </button>
        </div>
      )}
      {attached && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <span className="text-[11px] font-bold uppercase text-red-soft">{attached.type === "event" ? "Event" : "Attached"}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{attached.title}</span>
          <button type="button" onClick={() => setAttached(null)} aria-label="Remove product" className="text-ink-3">
            ×
          </button>
        </div>
      )}
      {pickerOpen && (
        <div className="mt-2 rounded-2xl border border-line bg-bg p-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, beats, merch"
            aria-label="Search products to attach"
            className="mb-2 w-full rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-red"
          />
          {query.trim().length >= 2 && hits.length === 0 ? (
            <p className="py-2 text-center text-xs text-ink-3">No products match.</p>
          ) : (
            hits.slice(0, 8).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setAttached({ type: "product", id: h.id, title: h.title });
                  setPickerOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{h.title}</span> <span className="text-ink-3">· {h.creator.displayName}</span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">{h.type === "RELEASE" ? "Music" : h.type === "BEAT" ? "Beat" : "Merch"}</span>
              </button>
            ))
          )}
        </div>
      )}
      <p className="mt-3 mb-1.5 text-[12px] text-ink-3">Who can see this?</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { k: "EVERYONE", t: "Everyone", d: "Anyone on XOLDOUT" },
            { k: "FOLLOWERS", t: "Followers only", d: "Only people who follow you" },
          ] as const
        ).map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => setAudience(o.k)}
            aria-pressed={audience === o.k}
            className={`rounded-xl border px-3 py-2 text-left ${audience === o.k ? "border-red bg-red-tint" : "border-line"}`}
          >
            <span className="block text-[13px] font-bold">{o.t}</span>
            <span className="block text-[11px] text-ink-3">{o.d}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="flex items-center gap-4">
        <button type="button" onClick={() => setPickerOpen((v) => !v)} aria-label="Attach a product" className={pickerOpen || attached ? "text-red-soft" : "text-ink-3"}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.5 3.5 0 015 5l-8.6 8.6a2 2 0 01-2.8-2.8l7.9-7.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <label className="text-ink-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) setCropFile(picked);
              e.target.value = "";
            }}
          />
          {cropFile && (
            <ImageCropModal
              file={cropFile}
              aspect={1}
              outputWidth={1024}
              outputHeight={1024}
              onCancel={() => setCropFile(null)}
              onConfirm={(cropped) => {
                setCropFile(null);
                handleFileSelected(cropped);
              }}
            />
          )}
          <svg viewBox="0 0 24 24" className="h-5 w-5 cursor-pointer" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10.5" r="1.75" />
            <path d="M21 16l-5.5-5.5L7 19" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-ink-3">
            {body.length}/{MAX_LEN}
          </span>
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-lg bg-red px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </form>
  );
}
