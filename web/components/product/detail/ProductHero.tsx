import Link from "next/link";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { ShareButton } from "@/components/ui/ShareButton";
import { ProductLikeButton } from "@/components/product/detail/ProductLikeButton";
import { SendToChatButton } from "@/components/messages/SendToChatButton";
import { ReportButton } from "@/components/trust/ReportButton";
import { PublishedByYou } from "@/components/product/PublishedByYou";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { BackCircle } from "./BackCircle";

type Person = { handle: string; displayName: string; isVerified?: boolean; verificationBadges?: string[] };

/**
 * The shared top of every v2 product page — music, beats, merch, events
 * (design/v2-prototype, 2026-11-09): round back button, artwork in a rounded
 * card (optional play button on it), a red category chip, the big serif
 * title with a Share pill, and the artist line. Price, details and the
 * purchase controls are passed in as children so each page keeps its own
 * buying logic untouched.
 */
export function ProductHero({
  image,
  aspect = "aspect-square",
  overlay,
  gallery,
  chip,
  title,
  creator,
  credits = [],
  creatorId,
  share,
  report,
  children,
}: {
  image: string | null | undefined;
  aspect?: string;
  // e.g. the play button, positioned inside the artwork card
  overlay?: React.ReactNode;
  // extra photos under the artwork (merch)
  gallery?: React.ReactNode;
  chip: string;
  title: string;
  creator: Person;
  // featured artists (accepted credits only)
  credits?: Person[];
  creatorId: string;
  share: { path: string; text: string; chatShare: { type: "PRODUCT" | "EVENT"; id: string } };
  report: { targetType: "PRODUCT" | "EVENT"; targetId: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="pb-6">
      <div className="px-4 pt-4 md:px-6">
        <BackCircle />
      </div>

      {/* Phones: artwork above the details. Wide screens: artwork on the left
          (stays in view while scrolling), details and buying on the right. */}
      <div className="md:grid md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:gap-10 md:px-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-14">
      <div className="px-4 pt-4 md:sticky md:top-4 md:self-start md:px-0">
        <div className={`relative ${aspect} w-full overflow-hidden rounded-[28px] bg-gradient-to-br from-red/50 via-red-tint to-black`}>
          {/* Already a ladder rung (lib/images.ts) — see ProductCard for why `unoptimized`. */}
          <ArtworkImage src={image} alt={title} sizes="(max-width: 768px) 100vw, 520px" priority unoptimized className="object-cover" />
          {overlay}
        </div>
        {gallery}
      </div>

      <div className="min-w-0 px-4 pt-5 md:max-w-2xl md:px-0 md:pt-4">
        <span className="inline-block rounded-full bg-red-tint px-3 py-1 text-[12px] font-bold uppercase tracking-[0.14em] text-red-soft">{chip}</span>
        <div className="mt-3 flex items-start justify-between gap-3">
          <h1 className="min-w-0 font-serif text-[32px] font-bold leading-[1.05] tracking-tight [overflow-wrap:anywhere] min-[380px]:text-[38px]">{title}</h1>
          <div className="flex shrink-0 items-start gap-2">
          {share.chatShare.type === "PRODUCT" && <ProductLikeButton productId={share.chatShare.id} />}
          <ShareButton
            title={title}
            text={share.text}
            path={share.path}
            label="Share"
            className="mt-1 shrink-0 border border-line bg-transparent text-ink px-4 py-2.5 text-[14px]"
          />
          </div>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[17px]">
          <Link href={`/u/${creator.handle}`} className="inline-flex items-center gap-1.5 font-medium text-ink">
            {creator.displayName}
            {creator.isVerified && <VerifiedBadge className="h-4 w-4 shrink-0" badgeType={primaryBadgeType(creator.verificationBadges)} />}
          </Link>
          {credits.length > 0 && (
            <span className="text-ink-3">
              feat.{" "}
              {credits.map((c, i) => (
                <span key={c.handle}>
                  {i > 0 && (i === credits.length - 1 ? " & " : ", ")}
                  <Link href={`/u/${c.handle}`} className="text-ink-2">
                    {c.displayName}
                  </Link>
                </span>
              ))}
            </span>
          )}
        </p>
        <PublishedByYou creatorId={creatorId} />

        <div className="mt-2 flex items-center gap-4">
          <SendToChatButton share={share.chatShare} />
          <ReportButton targetType={report.targetType} targetId={report.targetId} ownerId={creatorId} className="text-xs text-ink-3" />
        </div>

        {children}
      </div>
      </div>
    </div>
  );
}

/** Price line under the title: big red price plus a small stock note. */
export function HeroPrice({ price, note, noteTone = "muted" }: { price: React.ReactNode; note?: string | null; noteTone?: "muted" | "alert" }) {
  return (
    <div className="mt-4 flex items-end justify-between gap-3">
      <span className="font-serif text-[30px] font-bold leading-none text-red-soft">{price}</span>
      {note && <span className={`text-sm ${noteTone === "alert" ? "font-semibold text-red-soft" : "text-ink-3"}`}>{note}</span>}
    </div>
  );
}

/** "Single · Afrobeats · 104 BPM"-style detail line. */
export function HeroMeta({ parts }: { parts: (string | null | undefined | false)[] }) {
  const shown = parts.filter(Boolean) as string[];
  if (shown.length === 0) return null;
  return <p className="mt-2 text-[14px] text-ink-2">{shown.join(" · ")}</p>;
}

/** The description paragraph. */
export function HeroDescription({ text }: { text: string | null | undefined }) {
  if (!text?.trim()) return null;
  return <p className="mt-4 whitespace-pre-line text-[16px] leading-relaxed text-ink-2">{text.trim()}</p>;
}
