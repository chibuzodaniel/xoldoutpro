import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { readSections } from "@/lib/profile/sections";
import { BackHeader } from "@/components/ui/BackHeader";
import { ProfilePostsFeed } from "@/components/social/ProfilePostsFeed";

// One person's Socials posts (explicit ask, 2026-11-11: the profile shows a
// "View Socials posts" button instead of listing them). The posts load for
// the signed-in viewer, so likes, comments, reposts and followers-only rules
// all work as on Socials.
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle }, select: { displayName: true } });
  return user ? { title: `${user.displayName}'s posts · XOLDOUT` } : {};
}

export default async function ProfilePostsPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle }, select: { id: true, displayName: true, profileSections: true, deletedAt: true } });
  if (!user || user.deletedAt || !readSections(user.profileSections).posts) notFound();
  return (
    <div className="pb-24">
      <BackHeader title={`${user.displayName}'s posts`} />
      <div className="mx-auto max-w-2xl">
        <ProfilePostsFeed authorId={user.id} />
      </div>
    </div>
  );
}
