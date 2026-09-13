import type { ProductCardData } from "./discoverTypes";

export const AVATAR_COLORS = ["#6b0f1c", "#5e0d19", "#7d1424", "#4a0c15"];

export function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function ladderUrl(ladder: Record<string, string> | null | undefined, size: "64" | "256" | "1024") {
  return ladder?.[size];
}

export function imageUrlFor(product: ProductCardData, size: "64" | "256" | "1024") {
  if (product.type === "BEAT") return ladderUrl(product.beat?.coverImageLadder, size);
  if (product.type === "MERCH") return ladderUrl(product.merchItem?.imageLadder, size);
  return ladderUrl(product.release?.artworkLadder, size);
}

export function categoryLabelFor(product: ProductCardData) {
  if (product.type === "BEAT") return "Beat";
  if (product.type === "MERCH") return "Merch";
  const releaseType = product.release?.releaseType;
  if (!releaseType) return "Music";
  return releaseType.charAt(0) + releaseType.slice(1).toLowerCase();
}
