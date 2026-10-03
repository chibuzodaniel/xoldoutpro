import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildOgMetadata } from "@/lib/og";

// Link previews for shared Live links (explicit ask: hosts share their Live,
// or a scheduled Live, so people can join). The page itself is a client
// component, so the metadata lives here on the segment layout.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const live = await db.liveSession.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
      scheduledFor: true,
      coverImageLadder: true,
      creator: { select: { displayName: true, avatarUrl: true } },
    },
  });
  if (!live) return {};

  const name = live.creator.displayName;
  const cover = (live.coverImageLadder as Record<string, string> | null)?.["1024"] ?? live.creator.avatarUrl ?? "/api/og";
  const when = live.scheduledFor
    ? live.scheduledFor.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" })
    : null;

  const title =
    live.status === "LIVE" ? `🔴 ${name} is live on XOLDOUT` : live.status === "SCHEDULED" ? `${name} goes live${when ? ` ${when}` : ""}` : `${name} on XOLDOUT Live`;
  const description =
    live.status === "LIVE"
      ? `${live.title} — join the Live now.`
      : live.status === "SCHEDULED"
        ? `${live.title} — tap to get a reminder when it starts.`
        : `${live.title} — this Live has ended.`;

  return buildOgMetadata({ title, description, imageUrl: cover, path: `/live/${id}` });
}

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
