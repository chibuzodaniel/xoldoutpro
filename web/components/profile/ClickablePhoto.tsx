"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { PhotoActionSheet } from "./PhotoActionSheet";
import { PhotoViewerModal } from "./PhotoViewerModal";
import { useToast } from "@/components/ui/ToastProvider";

type Kind = "avatar" | "cover";

// Mirrors the server's derivative size for each kind (lib/images.ts
// resizeSquare/resizeBanner) so the crop the user picks is the crop that ships.
const CROP_CONFIG: Record<Kind, { aspect: number; cropShape: "round" | "rect"; outputWidth: number; outputHeight: number }> = {
  avatar: { aspect: 1, cropShape: "round", outputWidth: 512, outputHeight: 512 },
  cover: { aspect: 3, cropShape: "rect", outputWidth: 1200, outputHeight: 400 },
};

type Props = {
  targetUserId: string;
  kind: Kind;
  photoUrl: string | null;
  alt: string;
  label: string;
  className?: string;
  children: React.ReactNode;
};

// Owner tapping their own avatar/cover gets a choice (view vs. upload new);
// anyone else tapping it just views the current photo full-size — never a
// path to changing someone else's photo. Upload happens right here (file
// picker -> crop -> presign/PUT to R2 -> POST /api/me/{kind}), no detour
// through /profile/edit — that page's staged-until-Save-Changes flow is a
// separate, deliberate batch-edit path for the rest of the profile form.
export function ClickablePhoto({ targetUserId, kind, photoUrl, alt, label, className, children }: Props) {
  const { appUser, refreshAppUser } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const isOwner = appUser?.id === targetUserId;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleClick() {
    if (isOwner) {
      if (photoUrl) setSheetOpen(true);
      else openFilePicker();
    } else if (photoUrl) {
      setViewerOpen(true);
    }
  }

  async function handleCropConfirm(cropped: File) {
    setPendingFile(null);
    setUploading(true);
    try {
      const key = await uploadImage(cropped, kind);
      const res = await apiFetch(`/api/me/${kind}`, { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not save photo");
      await refreshAppUser();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      const res = await apiFetch(`/api/me/${kind}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete photo");
      await refreshAppUser();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setUploading(false);
    }
  }

  const clickable = isOwner || Boolean(photoUrl);
  if (!clickable) return <div className={className}>{children}</div>;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={uploading}
        className={`relative ${className ?? ""}`}
        aria-label={isOwner ? `${label} options` : `View ${label.toLowerCase()}`}
      >
        {children}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/50">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          </span>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPendingFile(file);
          e.target.value = "";
        }}
      />

      {sheetOpen && (
        <PhotoActionSheet
          title={label}
          onView={() => {
            setSheetOpen(false);
            setViewerOpen(true);
          }}
          onUpload={() => {
            setSheetOpen(false);
            openFilePicker();
          }}
          onRemove={() => {
            setSheetOpen(false);
            handleRemove();
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {viewerOpen && photoUrl && <PhotoViewerModal src={photoUrl} alt={alt} onClose={() => setViewerOpen(false)} />}

      {pendingFile && (
        <ImageCropModal
          file={pendingFile}
          aspect={CROP_CONFIG[kind].aspect}
          cropShape={CROP_CONFIG[kind].cropShape}
          outputWidth={CROP_CONFIG[kind].outputWidth}
          outputHeight={CROP_CONFIG[kind].outputHeight}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  );
}
