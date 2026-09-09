import Link from "next/link";
import { AppHeader } from "@/components/nav/AppHeader";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";
import { getWeeklyTopCreators } from "@/lib/discover/weeklyTopCreators";

export const revalidate = 20;

export default async function TopCreatorsPage() {
  const creators = await getWeeklyTopCreators(20);

  return (
    <div className="pb-8">
      <AppHeader />
      <section className="px-4">
        <h3 className="font-serif text-lg mb-4">Top This Week</h3>
        {creators.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing to show yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {creators.map((c, i) => (
              <Link key={c.id} href={`/u/${c.handle}`} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-center font-sans text-sm font-black text-ink-3">{i + 1}</span>
                <div
                  className={`h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-gradient-to-br ${
                    AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
                  }`}
                >
                  <FallbackImg
                    src={c.avatarUrl}
                    alt={c.displayName}
                    className="h-full w-full object-cover"
                    fallback={
                      <span className="flex h-full w-full items-center justify-center font-serif text-base text-white">
                        {c.displayName.slice(0, 1).toUpperCase()}
                      </span>
                    }
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-2 line-clamp-1">{c.displayName}</p>
                  <p className="text-xs text-ink-3">{c.metric}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
