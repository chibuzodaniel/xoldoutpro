import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BeatPurchaseAndPlayer } from "@/components/product/BeatPurchaseAndPlayer";
import { ProductHero, HeroPrice, HeroMeta, HeroDescription } from "@/components/product/detail/ProductHero";
import { HeroPlayButton } from "@/components/product/detail/HeroPlayButton";
import { buildOgMetadata } from "@/lib/og";
import { Price } from "@/components/currency/CurrencyProvider";

// Public product data — cache and revalidate in the background instead of
// hitting the DB on every view.
export const revalidate = 120;

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
      creator: { select: { handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true } },
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

  // v2 product page (design/v2-prototype): shared ProductHero on top; the
  // buy/play controls below are the same component as before.
  return (
    <ProductHero
      image={cover}
      overlay={
        <HeroPlayButton
          track={{
            trackId: product.id,
            title: product.title,
            artistName: product.creator.displayName,
            artworkUrl: cover ?? null,
            lyricsText: null,
            kind: "beat",
            productId: product.id,
          }}
        />
      }
      chip="Beat"
      title={product.title}
      creator={{ ...product.creator, verificationBadges: product.creator.verificationBadges as string[] }}
      creatorId={product.creatorId}
      share={{ path: `/b/${product.id}`, text: `${product.title} — ${product.creator.displayName} on XOLDOUT`, chatShare: { type: "PRODUCT", id: product.id } }}
      report={{ targetType: "PRODUCT", targetId: product.id }}
    >
        <HeroMeta parts={[...product.beat.tags, product.beat.musicalKey, product.beat.bpm ? `${product.beat.bpm} BPM` : null]} />
        <HeroPrice
          price={<Price kobo={product.priceKobo} freeLabel="Free" />}
          note={remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} of ${cap} left`) : `${sold} sold`}
          noteTone={remaining !== null ? "alert" : "muted"}
        />
        <HeroDescription text={product.description} />
        <div className="mt-5" />

        <BeatPurchaseAndPlayer
          productId={product.id}
          title={product.title}
          artistName={product.creator.displayName}
          artworkUrl={cover ?? null}
          durationSec={product.beat.durationSec}
          priceKobo={product.priceKobo}
          isSoldOut={isSoldOut}
        />

        <Link href="/legal/terms#beat-licenses" className="mt-4 block text-center text-[12px] text-ink-3 underline">
          View license terms
        </Link>
    </ProductHero>
  );
}
