import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { JoinCheckout, type JoinPlan } from "@/components/communities/JoinCheckout";

// A community's join page (explicit ask, 2026-11-16): JOIN COMMUNITY lands
// here, never on sign-up. Headline, description, membership benefits, then
// the plans with price, duration and benefits, and a guest checkout (name,
// email + code, optional phone, pay); the account comes after payment
// (lib/communities/guestJoin.ts). Public and cached for 5 minutes per
// community (web/CLAUDE.md CPU budget); spots-left can lag by that much,
// and the server re-checks capacity at checkout.
export const revalidate = 300;

const DEFAULT_DESCRIPTION = "Become part of a growing independent music community.";

const loadCommunity = cache(async (idOrHandle: string) => {
  const group = await db.fanbaseGroup.findFirst({
    where: { OR: [{ id: idOrHandle }, { handle: idOrHandle.toLowerCase() }], suspendedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      coverImageUrl: true,
      bannerUrl: true,
      joinHeadline: true,
      joinBenefits: true,
      plans: { where: { archivedAt: null }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!group) return null;
  const counts = await db.membership.groupBy({
    by: ["planId"],
    where: { groupId: group.id, planId: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    _count: { _all: true },
  });
  const plans: JoinPlan[] = group.plans.map((p) => {
    const used = counts.find((c) => c.planId === p.id)?._count._all ?? 0;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      priceKobo: p.priceKobo,
      cycle: p.cycle,
      benefits: p.benefits,
      requiresApproval: p.requiresApproval,
      spotsLeft: p.capacity == null ? null : Math.max(0, p.capacity - used),
    };
  });
  return { ...group, plans };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const c = await loadCommunity((await params).id);
  if (!c) return { title: "Community not found" };
  const title = c.joinHeadline || `Join ${c.name}`;
  return {
    title: `${title} · XOLDOUT`,
    description: c.description || DEFAULT_DESCRIPTION,
    openGraph: { title, description: c.description || DEFAULT_DESCRIPTION, images: c.bannerUrl || c.coverImageUrl ? [{ url: (c.bannerUrl || c.coverImageUrl)! }] : undefined },
  };
}

export default async function JoinCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await loadCommunity((await params).id);
  if (!c) notFound();
  const headline = c.joinHeadline || `Join ${c.name}`;

  return (
    <main className="mx-auto w-full max-w-3xl pb-16">
      <div className="relative">
        <div className="h-40 bg-gradient-to-br from-red/70 via-red/25 to-black bg-cover bg-center sm:h-56" style={c.bannerUrl ? { backgroundImage: `url(${c.bannerUrl})` } : undefined} />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-bg" />
        <Link href="/" className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1.5 text-[13px] font-extrabold tracking-wide text-white">
          XOLD<span className="text-red-soft">OUT</span>
        </Link>
      </div>

      <div className="-mt-12 px-4 sm:px-6">
        <span className="relative block h-20 w-20 overflow-hidden rounded-2xl border-2 border-bg bg-gradient-to-br from-red/50 to-black shadow-xl">
          <FallbackImg src={c.coverImageUrl} alt="" className="h-full w-full object-cover" fallback={null} />
        </span>
        <h1 className="mt-4 font-serif text-[34px] font-bold uppercase leading-[1.02] tracking-tight sm:text-[46px]">{headline}</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink-2">{c.description || DEFAULT_DESCRIPTION}</p>

        {c.joinBenefits.length > 0 && (
          <section className="mt-7">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.18em] text-red-soft">Membership benefits</h2>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {c.joinBenefits.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[15px]">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-red-soft" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
          </section>
        )}

        <JoinCheckout community={{ id: c.id, name: c.name }} plans={c.plans} />
      </div>
    </main>
  );
}
