import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FollowButton } from "@/components/profile/FollowButton";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle } });
  if (!user) notFound();

  return (
    <div className="pb-8">
      <div
        className="h-24 bg-surface-2"
        style={user.coverUrl ? { backgroundImage: `url(${user.coverUrl})`, backgroundSize: "cover" } : undefined}
      />
      <div className="px-4 -mt-8">
        <div className="flex items-end justify-between mb-3">
          <div className="h-16 w-16 rounded-full border-2 border-bg bg-surface-2 overflow-hidden flex items-center justify-center">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt={user.displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="font-serif text-lg text-ink-3">{user.displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <FollowButton targetUserId={user.id} />
        </div>

        <h1 className="font-serif text-xl">{user.displayName}</h1>
        <p className="text-sm text-ink-3 mb-2">@{user.handle}</p>
        {user.bio && <p className="text-sm text-ink-2 mb-3 max-w-md">{user.bio}</p>}

        {user.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {user.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
