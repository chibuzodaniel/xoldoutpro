import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PurchaseAndPlayer } from "@/components/product/PurchaseAndPlayer";
import { ProductHero, HeroPrice, HeroMeta, HeroDescription } from "@/components/product/detail/ProductHero";
import { HeroPlayButton } from "@/components/product/detail/HeroPlayButton";
import { buildOgMetadata } from "@/lib/og";
import { Price } from "@/components/currency/CurrencyProvider";
import { ReleaseExtras } from "@/components/addons/ReleaseExtras";
import { ReleaseTags } from "@/components/music/ReleaseTags";
import { acceptedCreditsSelect } from "@/lib/music/collaborators";
import { genreLabel } from "@/lib/music/tags";

// Public product data — cache and revalidate in the background instead of
// hitting the DB on every view.
export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    select: { title: true, description: true, creator: { select: { displayName: true } }, release: { select: { artworkLadder: true } } },
  });
  if (!product || !product.release) return {};
  const artwork = (product.release.artworkLadder as Record<string, string> | null)?.["1024"] ?? null;
  return buildOgMetadata({
    title: `${product.title} — ${product.creator.displayName}`,
    description: product.description || `Listen to ${product.title} by ${product.creator.displayName} on XOLDOUT.`,
    imageUrl: artwork,
    path: `/r/${id}`,
  });
}

export default async function ReleaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true } },
      release: { include: { tracks: { orderBy: { order: "asc" } } } },
      stockPolicy: true,
      // Featured artists — accepted tags only; pending ones stay private to
      // the two parties (/profile/collaborations).
      collaborators: acceptedCreditsSelect,
    },
  });

  if (!product || product.type !== "RELEASE" || product.status === "DELETED" || !product.release) notFound();

  const artwork = (product.release.artworkLadder as Record<string, string>)["1024"];
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  const firstTrack = product.release.tracks[0];
  const releaseLabel = product.release.releaseType === "EP" ? "EP" : product.release.releaseType === "ALBUM" ? "Album" : "Single";

  // v2 product page (design/v2-prototype): shared ProductHero on top; the
  // genre editor, pay-anything/tip/buy controls, track list and extras below
  // are the same components as before.
  return (
    <ProductHero
      image={artwork}
      overlay={
        firstTrack ? (
          <HeroPlayButton
            track={{
              trackId: firstTrack.id,
              title: firstTrack.title,
              artistName: product.creator.displayName,
              artworkUrl: artwork ?? null,
              lyricsText: firstTrack.lyricsText,
              productId: product.id,
            }}
            queue={product.release.tracks.map((t) => ({
              trackId: t.id,
              title: t.title,
              artistName: product.creator.displayName,
              artworkUrl: artwork ?? null,
              lyricsText: t.lyricsText,
              productId: product.id,
            }))}
          />
        ) : null
      }
      chip="Music"
      title={product.title}
      creator={{ ...product.creator, verificationBadges: product.creator.verificationBadges as string[] }}
      credits={product.collaborators.map((c) => c.artist)}
      creatorId={product.creatorId}
      share={{ path: `/r/${product.id}`, text: `${product.title} — ${product.creator.displayName} on XOLDOUT`, chatShare: { type: "PRODUCT", id: product.id } }}
      report={{ targetType: "PRODUCT", targetId: product.id }}
    >
        <HeroPrice
          price={
            product.payWhatYouWant ? (
              <>
                <Price kobo={product.priceKobo} />+
              </>
            ) : (
              <Price kobo={product.priceKobo} freeLabel="Free" />
            )
          }
          // Like the prototype, only scarcity is shown here (a capped release's "N of M left").
          note={remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} of ${cap} left`) : null}
          noteTone="alert"
        />
        <HeroMeta
          parts={[
            product.release.tracks.length > 1 ? `${releaseLabel} · ${product.release.tracks.length} tracks` : releaseLabel,
            ...product.release.genres.map(genreLabel),
            product.payWhatYouWant && "Pay what you want",
          ]}
        />

        <div className="mt-3" />
        <ReleaseTags
          productId={product.id}
          creatorId={product.creatorId}
          initialGenres={product.release.genres}
          title={product.title}
          description={product.description}
          priceKobo={product.priceKobo}
          artworkUrl={artwork ?? null}
          publishedAt={product.publishedAt ? product.publishedAt.toISOString() : null}
        />

        <HeroDescription text={product.description} />
        <div className="mt-5" />

        <PurchaseAndPlayer
          productId={product.id}
          creatorId={product.creatorId}
          artistName={product.creator.displayName}
          artworkUrl={artwork ?? null}
          priceKobo={product.priceKobo}
          payWhatYouWant={product.payWhatYouWant}
          title={product.title}
          isSoldOut={isSoldOut}
        />

        <ReleaseExtras productId={product.id} releaseTitle={product.title} />
    </ProductHero>
  );
}
