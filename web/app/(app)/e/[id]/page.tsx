import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EventTierPicker } from "@/components/product/EventTierPicker";
import { ProductHero, HeroDescription } from "@/components/product/detail/ProductHero";
import { EventPromotersPanel } from "@/components/product/EventPromotersPanel";
import { buildOgMetadata } from "@/lib/og";
import Link from "next/link";
import { lineupSelect } from "@/lib/event/lineup";
import { LINEUP_ROLE_LABEL } from "@/lib/event/lineupRules";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";

// Public product data — cache and revalidate in the background instead of
// hitting the DB on every view.
export const revalidate = 120;

function formatDate(d: Date) {
  return d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    select: { title: true, description: true, coverImageLadder: true, venue: true, isVirtual: true, creator: { select: { displayName: true } } },
  });
  if (!event) return {};
  const cover = (event.coverImageLadder as Record<string, string> | null)?.["1024"] ?? null;
  return buildOgMetadata({
    title: `${event.title} — ${event.creator.displayName}`,
    description: event.description || `${event.title} · ${event.isVirtual ? "Virtual event" : event.venue ?? "Live event"} on XOLDOUT.`,
    imageUrl: cover,
    path: `/e/${id}`,
  });
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 text-red-soft">{icon}</span>
      <span>
        <span className="block text-[14px] text-ink-3">{label}</span>
        <span className="block text-[18px]">{value}</span>
      </span>
    </div>
  );
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true, isVerified: true, verificationBadges: true, avatarUrl: true } },
      tiers: { include: { product: { include: { stockPolicy: true } } }, orderBy: { order: "asc" } },
      lineup: lineupSelect,
    },
  });

  if (!event || event.status === "DELETED") notFound();
  const organizerFollowers = await db.follow.count({ where: { followedId: event.creatorId } });

  const cover = (event.coverImageLadder as Record<string, string>)["1024"];

  // A deleted tier (permanent) or a paused one (creator-toggled, reversible —
  // see app/api/events/[id]/tiers/[tierId]'s PATCH) is off sale: skip it here.
  // Owned tickets from either state still show in the buyer's Library.
  const visibleTiers = event.tiers.filter((t) => t.product.status === "PUBLISHED" && !t.pausedAt);

  // v2 product page (design/v2-prototype): shared ProductHero on top; the
  // ticket picker and promoter panel below are the same components as before.
  return (
    <ProductHero
      image={cover}
      aspect="aspect-[4/3]"
      chip="Event"
      title={event.title}
      creator={{ ...event.creator, verificationBadges: event.creator.verificationBadges as string[] }}
      creatorId={event.creatorId}
      share={{ path: `/e/${event.id}`, text: `${event.title} — ${event.creator.displayName} on XOLDOUT`, chatShare: { type: "EVENT", id: event.id } }}
      report={{ targetType: "EVENT", targetId: event.id }}
    >
        {/* Event page v2 (user's reference, 2026-11-11): description, date and
            venue rows, organizer card, lineup, then tickets with a pinned buy bar. */}
        <HeroDescription text={event.description} />

        <div className="mt-5 flex flex-col gap-4">
          <InfoRow
            icon={
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="3.5" y="5" width="17" height="15" rx="2" />
                <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
              </svg>
            }
            label="Date and time"
            value={`${formatDate(event.startsAt)} · ${formatTime(event.startsAt)}`}
          />
          <InfoRow
            icon={
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" strokeLinejoin="round" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
            }
            label="Venue / location"
            value={event.isVirtual ? "Online event" : [event.venue ?? "Venue TBA", event.city].filter(Boolean).join(", ")}
          />
        </div>

        <p className="mt-7 mb-2 text-[15px] text-ink-3">Organizer</p>
        <Link href={`/u/${event.creator.handle}`} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-3.5">
          <span className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red/60 to-black">
            {event.creator.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- small avatar (CPU budget)
              <img src={event.creator.avatarUrl} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[17px] font-semibold">
              <span className="truncate">{event.creator.displayName}</span>
              {event.creator.isVerified && <VerifiedBadge className="h-4 w-4 shrink-0" badgeType={primaryBadgeType(event.creator.verificationBadges as string[])} />}
            </span>
            <span className="block text-[13px] text-ink-3">{organizerFollowers.toLocaleString("en-NG")} followers</span>
          </span>
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-2" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>

        {/* Artist Lineup card with roles (user's example, 2026-11-11): first 3, then "+N More". */}
        <section aria-label="Artist lineup" className="relative mt-7 rounded-2xl border border-white/10 bg-[#0f0f0f] px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[19px] font-bold">Artist Lineup</h2>
            {event.lineup.length > 3 && (
              <details className="group">
                <summary className="cursor-pointer list-none text-[14px] font-semibold text-red-soft">See All →</summary>
                <div className="absolute left-4 right-4 z-10 mt-2 rounded-2xl border border-white/10 bg-[#141414] p-3 md:left-auto md:w-80">
                  {event.lineup.map(({ user, role }) => (
                    <Link key={user.id} href={`/u/${user.handle}`} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate text-[15px]">{user.displayName}</span>
                      <span className="shrink-0 text-[12px] text-red-soft">{LINEUP_ROLE_LABEL[role] ?? "Artist"}</span>
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </div>
          {event.lineup.length === 0 ? (
            <p className="text-sm text-ink-3">Lineup to be announced.</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none]">
              {event.lineup.slice(0, 3).map(({ user, role }) => (
                <Link key={user.id} href={`/u/${user.handle}`} className="flex w-[96px] shrink-0 flex-col items-center gap-1 text-center">
                  <span className="relative">
                    <span className="block h-[84px] w-[84px] overflow-hidden rounded-full border-2 border-red bg-gradient-to-br from-white/20 to-black">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small avatar, no resize needed (CPU budget)
                        <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center font-serif text-2xl font-bold text-ink-3">{user.displayName.slice(0, 1).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-red px-2 py-0.5 text-[10px] font-bold text-white">
                      {LINEUP_ROLE_LABEL[role] ?? "Artist"}
                    </span>
                  </span>
                  <span className="mt-2.5 w-full truncate text-[14px]">{user.displayName}</span>
                </Link>
              ))}
              {event.lineup.length > 3 && (
                <span className="flex w-[84px] shrink-0 flex-col items-center gap-1 text-center">
                  <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full border border-white/15 text-[22px] font-bold">+{event.lineup.length - 3}</span>
                  <span className="mt-2.5 text-[14px] text-ink-2">More</span>
                </span>
              )}
            </div>
          )}
        </section>

        <EventTierPicker
          eventId={event.id}
          share={{ type: "event", id: event.id, label: "Event", title: event.title, subtitle: event.creator.displayName, imageUrl: cover, path: `/e/${event.id}`, shareText: `${event.title} — ${event.creator.displayName} on XOLDOUT` }}
          tiers={visibleTiers.map((t) => {
            const cap = t.product.stockPolicy?.cap ?? null;
            const sold = t.product.stockPolicy?.sold ?? 0;
            return {
              productId: t.productId,
              name: t.name,
              priceKobo: t.product.priceKobo,
              isSoldOut: Boolean(t.product.stockPolicy?.soldOutAt),
              remaining: cap !== null ? Math.max(cap - sold, 0) : null,
            };
          })}
        />

        <EventPromotersPanel eventId={event.id} eventTitle={event.title} creatorId={event.creatorId} />
    </ProductHero>
  );
}
