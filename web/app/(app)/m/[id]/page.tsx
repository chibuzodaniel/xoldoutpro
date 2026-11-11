import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { MerchPurchaseForm } from "@/components/product/MerchPurchaseForm";
import { ProductHero, HeroPrice, HeroMeta, HeroDescription } from "@/components/product/detail/ProductHero";
import { buildOgMetadata } from "@/lib/og";
import { MerchGallery } from "@/components/merch/MerchGallery";
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
      // Sizes & colours, in the seller's order.
      merchVariants: { orderBy: { order: "asc" }, select: { id: true, size: true, color: true, cap: true, sold: true, reserved: true, soldOutAt: true } },
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
      // Photo gallery with slideshow and zoom viewer (explicit ask, 2026-11-11).
      media={<MerchGallery images={[primaryImage, ...gallery].filter(Boolean)} title={product.title} />}
      chip="Merch"
      title={product.title}
      creator={{ ...product.creator, verificationBadges: product.creator.verificationBadges as string[] }}
      creatorId={product.creatorId}
      share={{ path: `/m/${product.id}`, text: `${product.title} — ${product.creator.displayName} on XOLDOUT`, chatShare: { type: "PRODUCT", id: product.id } }}
      report={{ targetType: "PRODUCT", targetId: product.id }}
      editHref={`/profile/catalog/edit/${product.id}`}
    >
      <HeroPrice
        price={<Price kobo={product.priceKobo} freeLabel="Free" />}
        note={remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} of ${cap} left`) : `${sold} sold`}
        noteTone={remaining !== null ? "alert" : "muted"}
      />
      <HeroMeta parts={["Physical item", shippingFee > 0 ? "Ships from the artist" : "Free shipping"]} />
      <HeroDescription text={product.description} />
      <div className="mt-5" />

      <MerchPurchaseForm
        productId={product.id}
        title={product.title}
        artistName={product.creator.displayName}
        imageUrl={primaryImage ?? null}
        priceKobo={product.priceKobo}
        shippingFeeKobo={shippingFee}
        isSoldOut={isSoldOut}
        sizeGuide={product.merchItem.sizeGuide}
        variants={product.merchVariants.map((v) => ({
          id: v.id,
          size: v.size,
          color: v.color,
          soldOut: Boolean(v.soldOutAt) || (v.cap !== null && v.sold + v.reserved >= v.cap),
          remaining: v.cap !== null ? Math.max(v.cap - v.sold, 0) : null,
        }))}
      />
    </ProductHero>
  );
}
