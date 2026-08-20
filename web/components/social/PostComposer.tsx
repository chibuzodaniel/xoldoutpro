"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import type { FeedPost } from "./PostCard";

const MAX_LEN = 500;

export function PostComposer({ onPosted }: { onPosted: (post: FeedPost) => void }) {
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(file: File) {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setError(null);
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

      const res = await apiFetch("/api/posts", { method: "POST", body: JSON.stringify({ body: trimmed, imageUrl }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not publish post");
      }
      const data = await res.json();
      onPosted(data.post);
      setBody("");
      clearImage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-b border-line-soft pb-4 mb-4">
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
            onClick={clearImage}
            className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
            aria-label="Remove photo"
          >
            ×
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-soft mt-2">{error}</p>}
      <div className="flex items-center justify-between mt-2">
        <label className="text-ink-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
          />
          <svg viewBox="0 0 24 24" className="h-5 w-5 cursor-pointer" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10.5" r="1.75" />
            <path d="M21 16l-5.5-5.5L7 19" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
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
