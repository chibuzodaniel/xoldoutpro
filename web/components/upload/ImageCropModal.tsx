"use client";

import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedImageBlob, type PixelCrop } from "@/lib/cropImage";

type Props = {
  file: File;
  aspect: number;
  cropShape?: "rect" | "round";
  outputWidth: number;
  outputHeight: number;
  onCancel: () => void;
  onConfirm: (file: File) => void;
};

// Full-screen crop step between file selection and upload — the server
// (lib/images.ts) center-crops with `fit: "cover"` and no user input, so
// without this the user has no control over what part of the image survives.
// Output dimensions match the server's target aspect exactly, making its
// resize a no-op on framing.
export function ImageCropModal({ file, aspect, cropShape = "rect", outputWidth, outputHeight, onCancel, onConfirm }: Props) {
  const [imageSrc] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, outputWidth, outputHeight, file.type);
      const cropped = new File([blob], file.name, { type: file.type });
      URL.revokeObjectURL(imageSrc);
      onConfirm(cropped);
    } catch {
      setError("Could not crop image");
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    URL.revokeObjectURL(imageSrc);
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="relative flex-1 min-h-0">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          cropShape={cropShape}
          showGrid={cropShape === "rect"}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="shrink-0 border-t border-line-soft bg-surface px-4 py-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="text-[12px] uppercase tracking-widest text-ink-3 shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-red"
          />
        </div>

        {error && <p className="text-sm text-red-soft">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-line px-4 py-3 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !croppedAreaPixels}
            className="flex-1 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-red-soft disabled:opacity-50"
          >
            {busy ? "Cropping…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
