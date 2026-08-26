import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BeatPurchaseAndPlayer } from "@/components/product/BeatPurchaseAndPlayer";
import { ReportButton } from "@/components/trust/ReportButton";
import { ShareButton } from "@/components/ui/ShareButton";
import { PublishedByYou } from "@/components/product/PublishedByYou";
import { buildOgMetadata } from "@/lib/og";

// Public product data — cache and revalidate in the background instead of
// hitting the DB on every view.
export const revalidate = 30;

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    select: { title: true, description: true, creator: { select: { displayName: true } }, beat: { select: { coverImageLadder: true } } },
  });
  if (!product || !product.beat) return {};
  const cover = (product.beat.coverImageLadder as Record<string, string> | null)?.["1024"] ?? null;
  return buildOgMetadata({
    title: `${product.title} — ${product.creator.displayName}`,
    description: product.description || `${product.title}, a beat by ${product.creator.displayName} on XOLDOUT.`,
    imageUrl: cover,
    path: `/b/${id}`,
  });
}

export default async function BeatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true, avatarUrl: true } },
      beat: true,
      stockPolicy: true,
    },
  });

  if (!product || product.type !== "BEAT" || product.status === "DELETED" || !product.beat) notFound();

  const cover = (product.beat.coverImageLadder as Record<string, string>)["1024"];
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  return (
    <div className="pb-10">
      <div className="relative aspect-square w-full bg-surface-2">
        {/* Already a ladder rung (lib/images.ts) — see ProductCard for why `unoptimized`. */}
        {cover && <Image src={cover} alt={product.title} fill sizes="100vw" priority unoptimized className="object-cover" />}
      </div>

      <div className="px-4 pt-4">
        <span className="inline-block rounded-full bg-red/10 text-red-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide mb-2">
          Beat
        </span>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">{product.title}</h1>
            <Link href={`/u/${product.creator.handle}`} className="text-sm text-ink-3">
              {product.creator.displayName}
            </Link>
            <PublishedByYou creatorId={product.creatorId} />
          </div>
          <div className="flex items-center gap-3 shrink-0 pt-1">
            <ShareButton title={product.title} text={`${product.title} — ${product.creator.displayName} on XOLDOUT`} path={`/b/${product.id}`} />
            <ReportButton targetType="PRODUCT" targetId={product.id} ownerId={product.creatorId} className="text-xs text-ink-3" />
          </div>
        </div>

        {(product.beat.bpm || product.beat.musicalKey || product.beat.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {product.beat.bpm && (
              <span className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2">{product.beat.bpm} BPM</span>
            )}
            {product.beat.musicalKey && (
              <span className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2">{product.beat.musicalKey}</span>
            )}
            {product.beat.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 mb-4">
          <span className="font-serif text-lg">{formatNaira(product.priceKobo)}</span>
          {remaining !== null ? (
            <span className="text-sm font-semibold text-red-soft">
              {isSoldOut ? "Sold out" : `${remaining} of ${cap} left`}
            </span>
          ) : (
            <span className="text-sm text-ink-3">{sold} sold</span>
          )}
        </div>

        {product.description && <p className="text-sm text-ink-2 mb-5">{product.description}</p>}

        <BeatPurchaseAndPlayer
          productId={product.id}
          title={product.title}
          artistName={product.creator.displayName}
          artworkUrl={cover ?? null}
          durationSec={product.beat.durationSec}
          priceKobo={product.priceKobo}
          isSoldOut={isSoldOut}
        />
      </div>
    </div>
  );
}
