"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { ImageCropModal } from "@/components/upload/ImageCropModal";

export default function UploadMerchPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [shippingFeeNaira, setShippingFeeNaira] = useState("");
  const [hasCap, setHasCap] = useState(false);
  const [capValue, setCapValue] = useState("");

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageLadder, setImageLadder] = useState<Record<string, string> | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageCropFile, setImageCropFile] = useState<File | null>(null);

  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [galleryUploading, setGalleryUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleImageSelected(file: File) {
    setImagePreview(URL.createObjectURL(file));
    setImageUploading(true);
    setError(null);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not process photo");
      const data = await res.json();
      setImageLadder(data.artworkLadder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setImageUploading(false);
    }
  }

  function handleGalleryFilesSelected(files: FileList) {
    const newFiles = Array.from(files).slice(0, 8 - galleryFiles.length);
    setGalleryFiles((cur) => [...cur, ...newFiles]);
    setGalleryPreviews((cur) => [...cur, ...newFiles.map((f) => URL.createObjectURL(f))]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!imageLadder) return setError("Add a product photo before publishing");

    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100);
    if (!priceNaira || priceKobo <= 0) return setError("Set a price");
    const shippingFeeKobo = Math.round(parseFloat(shippingFeeNaira || "0") * 100);
    const cap = hasCap ? parseInt(capValue, 10) : null;
    if (hasCap && (!capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
      return setError("Enter a valid limited quantity");
    }

    setSubmitting(true);
    try {
      let galleryImageUrls: string[] = [];
      if (galleryFiles.length > 0) {
        setGalleryUploading(true);
        galleryImageUrls = await Promise.all(
          galleryFiles.map(async (file) => {
            const key = await uploadImage(file, "artwork");
            const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
            if (!res.ok) throw new Error("Could not process a gallery photo");
            const data = await res.json();
            return (data.artworkLadder as Record<string, string>)["1024"];
          }),
        );
        setGalleryUploading(false);
      }

      const payload = { title, description, priceKobo, shippingFeeKobo, cap, imageLadder, galleryImageUrls };

      const res = await apiFetch("/api/merch", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not publish listing");
      }
      router.push("/profile/catalog/merch");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-24">
      <h1 className="font-serif text-2xl mb-6">Add Merchandise</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Product photo</label>
          <label className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-ink-3">Add square photo</span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setImageCropFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {imageUploading && <p className="text-xs text-ink-3">Processing photo…</p>}

          {imageCropFile && (
            <ImageCropModal
              file={imageCropFile}
              aspect={1}
              outputWidth={1024}
              outputHeight={1024}
              onCancel={() => setImageCropFile(null)}
              onConfirm={(cropped) => {
                setImageCropFile(null);
                handleImageSelected(cropped);
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Gallery photos (optional)</label>
          <div className="flex gap-2 flex-wrap">
            {galleryPreviews.map((src, i) => (
              <div key={i} className="h-16 w-16 rounded-lg overflow-hidden bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
            {galleryFiles.length < 8 && (
              <label className="h-16 w-16 rounded-lg border border-dashed border-line bg-surface flex items-center justify-center cursor-pointer">
                <span className="text-xs text-ink-3">+</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleGalleryFilesSelected(e.target.files);
                  }}
                />
              </label>
            )}
          </div>
          {galleryUploading && <p className="text-xs text-ink-3">Processing gallery…</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red resize-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Price</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-ink-3">₦</span>
            <input
              type="number"
              min={1}
              step="1"
              value={priceNaira}
              onChange={(e) => setPriceNaira(e.target.value)}
              className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Shipping fee (optional)</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-ink-3">₦</span>
            <input
              type="number"
              min={0}
              step="1"
              placeholder="0"
              value={shippingFeeNaira}
              onChange={(e) => setShippingFeeNaira(e.target.value)}
              className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
          <p className="text-[10.5px] text-ink-3">Added to the price at checkout. Leave blank for free shipping.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Limited quantity</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHasCap((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                hasCap ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              {hasCap ? "Capped" : "Unlimited"}
            </button>
            {hasCap && (
              <input
                type="number"
                min={1}
                step="1"
                placeholder="e.g. 100"
                value={capValue}
                onChange={(e) => setCapValue(e.target.value)}
                className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
              />
            )}
          </div>
        </div>

        <p className="text-[10.5px] text-ink-3">
          You ship this yourself once an order comes in — mark it shipped from your catalog once it&apos;s on its way.
        </p>

        {error && <p className="text-sm text-red-soft">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Publishing…" : "Publish"}
        </button>
      </form>
    </div>
  );
}
