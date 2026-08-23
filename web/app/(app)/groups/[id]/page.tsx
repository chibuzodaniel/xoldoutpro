import type { Metadata } from "next";
import { db } from "@/lib/db";
import { buildOgMetadata } from "@/lib/og";
import { GroupDetailClient } from "./GroupDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const group = await db.fanbaseGroup.findUnique({
    where: { id },
    select: { name: true, description: true, coverImageUrl: true },
  });
  if (!group) return {};
  return buildOgMetadata({
    title: `${group.name} on XOLDOUT`,
    description: group.description || `Join ${group.name}, a Fanbase on XOLDOUT.`,
    imageUrl: group.coverImageUrl,
    path: `/groups/${id}`,
  });
}

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupDetailClient id={id} />;
}
