import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildOgMetadata } from "@/lib/og";
import { CommunityPage } from "@/components/communities/CommunityPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const group = await db.fanbaseGroup.findUnique({
    where: { id },
    select: { name: true, description: true, coverImageUrl: true },
  });
  if (!group) return {};
  return buildOgMetadata({
    title: `${group.name} on XOLDOUT`,
    description: group.description || `Join ${group.name}, a community on XOLDOUT.`,
    imageUrl: group.coverImageUrl,
    path: `/groups/${id}`,
  });
}

// Communities: the community page with its Timeline (2026-11-11 — channels
// replaced). Old ?channel= links from notifications open the Timeline too.
export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const [{ id }, { channel }] = await Promise.all([params, searchParams]);
  void channel;
  return <CommunityPage id={id} />;
}
