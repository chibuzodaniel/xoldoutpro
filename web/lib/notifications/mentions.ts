import { db } from "@/lib/db";
import { parseMentions } from "@/lib/groups/mentions";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

// "@handle" in a Socials post or comment notifies (bell + push) the people
// named (explicit ask, 2026-11-10: notifications for everything). One
// lookup for up to 10 handles; never the author, never anyone in `exclude`
// (e.g. a post author who already got a "new comment" alert).
export async function notifyMentions(args: {
  body: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  url: string;
  where: string; // "a post" | "a comment"
  exclude?: string[];
}) {
  const { handles } = parseMentions(args.body);
  if (handles.length === 0) return;
  const users = await db.user.findMany({
    where: { handle: { in: handles.slice(0, 10), mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  const skip = new Set([args.author.id, ...(args.exclude ?? [])]);
  const ids = users.map((u) => u.id).filter((id) => !skip.has(id));
  if (ids.length === 0) return;
  notifyUsersAfterResponse(ids, {
    kind: "COMMENT",
    title: `${args.author.displayName} mentioned you`,
    body: `In ${args.where}: ${args.body.slice(0, 120)}`,
    url: args.url,
    icon: args.author.avatarUrl ?? undefined,
  });
}
