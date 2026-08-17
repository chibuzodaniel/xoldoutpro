import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ProfileHeaderRow } from "@/components/profile/ProfileHeaderRow";
import { ClickablePhoto } from "@/components/profile/ClickablePhoto";
import { ProductCard } from "@/components/product/ProductCard";
import { ReportButton } from "@/components/trust/ReportButton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";

// Public, non-personalized profile data — cache and serve from the CDN,
// revalidating in the background rather than hitting the DB on every view.
export const revalidate = 30;

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  Instagram: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  X: (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M4 4l16 16M20 4L4 20" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" />
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 4v10.5a3.5 3.5 0 11-3.5-3.5" strokeLinecap="round" />
      <path d="M14 4c0 2.5 2 4.5 4.5 4.5" strokeLinecap="round" />
    </svg>
  ),
  YouTube: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
  Website: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  ),
};

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle } });
  if (!user) notFound();

  const catalog = await db.product.findMany({
    where: { creatorId: user.id, type: { in: ["RELEASE", "BEAT", "MERCH"] }, status: "PUBLISHED" },
    include: {
      creator: { select: { handle: true, displayName: true } },
      release: { select: { artworkLadder: true, releaseType: true } },
      beat: { select: { coverImageLadder: true } },
      merchItem: { select: { imageLadder: true } },
      stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
    },
    orderBy: { publishedAt: "desc" },
  });

  const socialLinks = (user.socialLinks as { platform: string; url: string }[] | null) ?? [];

  return (
    <div className="pb-8">
      <ClickablePhoto
        targetUserId={user.id}
        kind="cover"
        photoUrl={user.coverUrl}
        alt="Cover photo"
        label="Cover photo"
        className="block w-full"
      >
        <div
          className="h-24 bg-surface-2 bg-cover bg-center"
          style={user.coverUrl ? { backgroundImage: `url(${user.coverUrl})` } : undefined}
        />
      </ClickablePhoto>
      <div className="px-4 -mt-8">
        <ProfileHeaderRow targetUserId={user.id} avatarUrl={user.avatarUrl} displayName={user.displayName} />

        <div className="flex items-start justify-between gap-3">
          <h1 className="flex items-center gap-1.5 font-serif text-xl">
            {user.displayName}
            {user.isVerified && <VerifiedBadge className="h-4 w-4 text-red-soft shrink-0" />}
          </h1>
          <ReportButton targetType="PROFILE" targetId={user.id} className="text-xs text-ink-3 shrink-0 pt-1" />
        </div>
        <p className="text-sm text-ink-3 mb-2">@{user.handle}</p>
        {user.bio && <p className="text-sm text-ink-2 mb-3 max-w-md">{user.bio}</p>}

        {user.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {user.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
                {tag}
              </span>
            ))}
          </div>
        )}

        {socialLinks.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            {socialLinks.map((link) => (
              <a
                key={link.platform}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="h-5 w-5 text-ink-2"
                aria-label={link.platform}
              >
                {SOCIAL_ICONS[link.platform]}
              </a>
            ))}
          </div>
        )}

        {catalog.length > 0 && (
          <div className="mt-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Catalog</h2>
            <div className="grid grid-cols-3 gap-3">
              {catalog.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
