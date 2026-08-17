"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import type { ChatMessageData } from "./ChatMessage";

type Props = {
  groupId: string;
  replyingTo: ChatMessageData | null;
  onClearReply: () => void;
  onPosted: (message: ChatMessageData) => void;
};

// Bottom-pinned (sticky, not fixed — sticks to the shared scroll region's
// bottom edge the same way MiniPlayer/BottomNav already do) to match the
// chat reference: attach + text + send in one row, with an optional
// "replying to X" strip above it that clears once you send or dismiss it.
export function ChatComposer({ groupId, replyingTo, onClearReply, onPosted }: Props) {
  const [body, setBody] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pollMode, setPollMode] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function updateOption(i: number, value: string) {
    setOptions((cur) => cur.map((o, idx) => (idx === i ? value : o)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    const pollOptions = pollMode ? options.map((o) => o.trim()).filter(Boolean) : undefined;
    if (pollMode && (!pollOptions || pollOptions.length < 2)) {
      setError("Add at least two poll options");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const key = await uploadImage(imageFile, "artwork");
        const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
        if (!res.ok) throw new Error("Could not attach photo");
        const data = await res.json();
        imageUrl = (data.artworkLadder as Record<string, string>)["1024"];
      }

      const res = await apiFetch(`/api/groups/${groupId}/posts`, {
        method: "POST",
        body: JSON.stringify({ body: trimmed, imageUrl, pollOptions, replyToId: replyingTo?.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not send");
      }
      const data = await res.json();
      onPosted(data.post);
      setBody("");
      setImageFile(null);
      setPollMode(false);
      setOptions(["", ""]);
      onClearReply();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sticky bottom-0 bg-bg/95 backdrop-blur border-t border-line-soft px-3 pt-2 pb-3">
      {replyingTo && (
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-2.5 py-1.5 mb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-red-soft">Replying to {replyingTo.author.displayName}</p>
            <p className="text-xs text-ink-3 line-clamp-1">{replyingTo.body}</p>
          </div>
          <button type="button" onClick={onClearReply} className="text-ink-3 shrink-0 ml-2" aria-label="Cancel reply">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {imageFile && (
        <div className="flex items-center gap-2 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={URL.createObjectURL(imageFile)} alt="" className="h-10 w-10 rounded object-cover" />
          <button type="button" onClick={() => setImageFile(null)} className="text-xs text-ink-3">
            Remove
          </button>
        </div>
      )}

      {pollMode && (
        <div className="flex flex-col gap-1.5 mb-2">
          {options.map((option, i) => (
            <input
              key={i}
              value={option}
              onChange={(e) => updateOption(i, e.target.value.slice(0, 80))}
              placeholder={`Option ${i + 1}`}
              className="rounded-lg border border-line-soft bg-transparent px-2.5 py-1.5 text-xs outline-none focus:border-red"
            />
          ))}
          <div className="flex items-center justify-between">
            {options.length < 6 && (
              <button type="button" onClick={() => setOptions((cur) => [...cur, ""])} className="text-[11px] text-ink-3">
                + Add option
              </button>
            )}
            <button type="button" onClick={() => setPollMode(false)} className="text-[11px] text-red-soft">
              Remove poll
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-soft mb-2">{error}</p>}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setImageFile(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 w-9 rounded-full border border-line flex items-center justify-center text-ink-3 shrink-0"
          aria-label="Attach photo"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M21.4 11.5l-8.5 8.5a5 5 0 01-7-7l8.5-8.5a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3l7.9-7.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setPollMode((v) => !v)}
          className={`h-9 w-9 rounded-full border flex items-center justify-center shrink-0 ${pollMode ? "border-red text-red-soft" : "border-line text-ink-3"}`}
          aria-label="Add poll"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M6 20V10M12 20V4M18 20v-6" strokeLinecap="round" />
          </svg>
        </button>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 500))}
          placeholder="Message the group…"
          className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-red"
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="h-9 w-9 rounded-full bg-red flex items-center justify-center shrink-0 disabled:opacity-40"
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
            <path d="M4 12l16-8-6 8 6 8z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
