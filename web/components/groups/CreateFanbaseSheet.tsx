"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { useToast } from "@/components/ui/ToastProvider";

type Props = { open: boolean; onClose: () => void; onCreated: (groupId: string) => void };

// Matches the "Create Fanbase" reference exactly: avatar preview (tap to
// upload/crop, same flow as changing a group's photo post-creation), name,
// optional description, a fixed privacy notice (no visibility toggle — every
// Fanbase created here is request-to-join, full stop).
export function CreateFanbaseSheet({ open, onClose, onCreated }: Props) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setDescription("");
    setPhotoFile(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setPhotoKey(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePhotoConfirm(cropped: File) {
    setPhotoFile(null);
    setUploadingPhoto(true);
    try {
      const key = await uploadImage(cropped, "avatar");
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(URL.createObjectURL(cropped));
      setPhotoKey(key);
    } catch {
      toast.error("Couldn't upload that photo. Try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || undefined,
          visibility: "REQUEST_TO_JOIN",
          coverImageKey: photoKey ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not create Fanbase");
      reset();
      onCreated(data.group.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            aria-label="Add a group photo"
            className={`relative h-20 w-20 rounded-full overflow-hidden flex items-center justify-center text-2xl font-semibold text-white/90 ${
              photoPreviewUrl ? "bg-surface-2" : `bg-gradient-to-br ${AVATAR_GRADIENTS[0]}`
            }`}
          >
            {photoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- object URL preview, not worth Next/Image's remote-loader setup
              <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              (name.trim() || "?").slice(0, 1).toUpperCase()
            )}
            {uploadingPhoto && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </span>
            )}
            {!photoPreviewUrl && !uploadingPhoto && (
              <span className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-full bg-red border-2 border-surface flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPhotoFile(file);
              e.target.value = "";
            }}
          />
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

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submitting ? "Creating…" : "Create Fanbase"}
          </button>
        </form>
      </div>

      {photoFile && (
        <ImageCropModal
          file={photoFile}
          aspect={1}
          cropShape="round"
          outputWidth={512}
          outputHeight={512}
          onCancel={() => setPhotoFile(null)}
          onConfirm={handlePhotoConfirm}
        />
      )}
    </div>
  );
}
