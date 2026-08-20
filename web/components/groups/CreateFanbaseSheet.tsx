"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";

type Props = { open: boolean; onClose: () => void; onCreated: (groupId: string) => void };

// Matches the "Create Fanbase" reference exactly: avatar preview, name,
// optional description, a fixed privacy notice (no visibility toggle — every
// Fanbase created here is request-to-join, full stop).
export function CreateFanbaseSheet({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setDescription("");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined, visibility: "REQUEST_TO_JOIN" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not create Fanbase");
      reset();
      onCreated(data.group.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={handleClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-4 right-4 h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <h1 className="font-serif text-2xl mb-5">Create Fanbase</h1>

        <div className="flex justify-center mb-5">
          <div
            className={`h-20 w-20 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[0]} flex items-center justify-center text-2xl font-semibold text-white/90`}
          >
            {(name.trim() || "?").slice(0, 1).toUpperCase()}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Fanbase name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="e.g. The Inner Circle"
              className="rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-red"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="What's this group for?"
              rows={2}
              className="rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-red resize-none"
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-line-soft p-3">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 118 0v3" />
            </svg>
            <p className="text-xs text-ink-3">Private by default — fans must request to join, and you approve every member.</p>
          </div>

          {error && <p className="text-xs text-red-soft">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Creating…" : "Create Fanbase"}
          </button>
        </form>
      </div>
    </div>
  );
}
