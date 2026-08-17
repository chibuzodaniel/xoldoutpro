"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { GroupPost } from "./GroupPostCard";

const MAX_LEN = 500;

export function GroupPostComposer({ groupId, onPosted }: { groupId: string; onPosted: (post: GroupPost) => void }) {
  const [body, setBody] = useState("");
  const [pollMode, setPollMode] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await apiFetch(`/api/groups/${groupId}/posts`, { method: "POST", body: JSON.stringify({ body: trimmed, pollOptions }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not post");
      }
      const data = await res.json();
      onPosted(data.post);
      setBody("");
      setOptions(["", ""]);
      setPollMode(false);
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
        placeholder="Post to the group…"
        rows={2}
        className="w-full resize-none bg-transparent text-sm placeholder:text-ink-3 focus:outline-none"
      />

      {pollMode && (
        <div className="flex flex-col gap-2 mt-2">
          {options.map((option, i) => (
            <input
              key={i}
              value={option}
              onChange={(e) => updateOption(i, e.target.value.slice(0, 80))}
              placeholder={`Option ${i + 1}`}
              className="rounded-lg border border-line-soft bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
            />
          ))}
          {options.length < 6 && (
            <button type="button" onClick={() => setOptions((cur) => [...cur, ""])} className="text-xs text-ink-3 text-left">
              + Add option
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-soft mt-2">{error}</p>}

      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={() => setPollMode((v) => !v)}
          className={`text-[11px] font-semibold uppercase tracking-widest ${pollMode ? "text-red-soft" : "text-ink-3"}`}
        >
          {pollMode ? "Remove poll" : "+ Poll"}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-ink-3">
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
