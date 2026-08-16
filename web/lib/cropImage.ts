export type PixelCrop = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Renders the selected crop region to a canvas at the target output size and
 * returns it as a Blob. Output dimensions match the server's `fit: "cover"`
 * resize target (lib/images.ts), so the server-side resize becomes a no-op
 * on aspect and the user's chosen crop is preserved exactly.
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  crop: PixelCrop,
  outputWidth: number,
  outputHeight: number,
  mimeType: string,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not export cropped image"))),
      mimeType,
      0.92,
    );
  });
}
