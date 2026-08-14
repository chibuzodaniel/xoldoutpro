import sharp from "sharp";

/** Center-cropped square, resized down — used for avatars. Never upscales. */
export async function resizeSquare(input: Buffer, size: number) {
  return sharp(input)
    .resize(size, size, { fit: "cover", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Fixed-aspect-ratio crop, resized down — used for the profile cover banner. */
export async function resizeBanner(input: Buffer, width: number, height: number) {
  return sharp(input)
    .resize(width, height, { fit: "cover", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Square artwork ladder for release covers — PRD §7.1 requires a size ladder, not one image. */
export async function artworkLadder(input: Buffer) {
  const sizes = [64, 256, 1024] as const;
  const entries = await Promise.all(
    sizes.map(async (size) => [String(size), await resizeSquare(input, size)] as const),
  );
  return entries;
}
