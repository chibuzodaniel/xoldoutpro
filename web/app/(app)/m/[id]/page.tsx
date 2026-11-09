import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MerchPurchaseForm } from "@/components/product/MerchPurchaseForm";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { ProductHero, HeroPrice, HeroMeta, HeroDescription } from "@/components/product/detail/ProductHero";
import { buildOgMetadata } from "@/lib/og";
import { Price } from "@/components/currency/CurrencyProvider";

// Public product data — cache and revalidate in the background instead of
// hitting the DB on every view.
export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    select: { title: true, description: true, creator: { select: { displayName: true } }, merchItem: { select: { imageLadder: true } } },
  });
  if (!product || !product.merchItem) return {};
  const image = (product.merchItem.imageLadder as Record<string, string> | null)?.["1024"] ?? null;
  return buildOgMetadata({
    title: `${product.title} — ${product.creator.displayName}`,
    description: product.description || `${product.title} by ${product.creator.displayName} on XOLDOUT.`,
    imageUrl: image,
    path: `/m/${id}`,
  });
}

export default async function MerchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true } },
      merchItem: true,
      stockPolicy: true,
    },
  });

  if (!product || product.type !== "MERCH" || product.status === "DELETED" || !product.merchItem) notFound();

  const primaryImage = (product.merchItem.imageLadder as Record<string, string>)["1024"];
  const gallery = product.merchItem.galleryImageUrls;
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  const shippingFee = product.merchItem.shippingFeeKobo;

  // v2 product page (design/v2-prototype): shared ProductHero on top; the
  // order form below is the same component as before.
  return (
    <ProductHero
      image={primaryImage}
      gallery={
        gallery.length > 0 ? (
          // Raw, uncropped uploads (galleryImageUrls has no ladder), so these
          // still go through the image optimizer.
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {gallery.map((url) => (
              <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                <ArtworkImage src={url} alt={product.title} sizes="64px" className="object-cover" />
              </div>
            ))}
          </div>
        ) : null
      }
      chip="Merch"
      title={product.title}
      creator={{ ...product.creator, verificationBadges: product.creator.verificationBadges as string[] }}
      creatorId={product.creatorId}
      share={{ path: `/m/${product.id}`, text: `${product.title} — ${product.creator.displayName} on XOLDOUT`, chatShare: { type: "PRODUCT", id: product.id } }}
      report={{ targetType: "PRODUCT", targetId: product.id }}
    >
      <HeroPrice
        price={<Price kobo={product.priceKobo} freeLabel="Free" />}
        note={remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} of ${cap} left`) : `${sold} sold`}
        noteTone={remaining !== null ? "alert" : "muted"}
      />
      <HeroMeta parts={["Physical item", shippingFee > 0 ? "Ships from the artist" : "Free shipping"]} />
      <HeroDescription text={product.description} />
      <div className="mt-5" />

      <MerchPurchaseForm productId={product.id} priceKobo={product.priceKobo} shippingFeeKobo={shippingFee} isSoldOut={isSoldOut} />
    </ProductHero>
  );
}
