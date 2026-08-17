import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PurchaseAndPlayer } from "@/components/product/PurchaseAndPlayer";
import { ReportButton } from "@/components/trust/ReportButton";

export const dynamic = "force-dynamic";

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default async function ReleaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true, avatarUrl: true } },
      release: { include: { tracks: { orderBy: { order: "asc" } } } },
      stockPolicy: true,
    },
  });

  if (!product || product.type !== "RELEASE" || product.status === "DELETED" || !product.release) notFound();

  const artwork = (product.release.artworkLadder as Record<string, string>)["1024"];
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  return (
    <div className="pb-10">
      <div className="aspect-square w-full bg-surface-2">
        {artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artwork} alt={product.title} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">{product.title}</h1>
            <Link href={`/u/${product.creator.handle}`} className="text-sm text-ink-3">
              {product.creator.displayName}
            </Link>
          </div>
          <ReportButton targetType="PRODUCT" targetId={product.id} ownerId={product.creatorId} className="text-xs text-ink-3 shrink-0 pt-1" />
        </div>

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

        <PurchaseAndPlayer
          productId={product.id}
          artistName={product.creator.displayName}
          artworkUrl={artwork ?? null}
          priceKobo={product.priceKobo}
          isSoldOut={isSoldOut}
        />
      </div>
    </div>
  );
}
