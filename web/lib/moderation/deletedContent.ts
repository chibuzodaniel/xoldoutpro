import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Deleted content archive (explicit ask, 2026-11-11). Model and reasoning:
// prisma/schema.prisma's DeletedContent. Each archive* function runs inside
// the delete's own transaction, BEFORE the rows are removed, and copies the
// item plus everything removed with it, so restore() can put back exactly
// what was there. The delete itself is unchanged, so nothing that reads
// these tables (web or mobile) needs a "deleted" filter.

export type DeletedKind = "POST" | "COMMENT" | "SONG_COMMENT" | "FEEDBACK" | "COMMUNITY" | "PLAYLIST" | "ADD_ON";
export type DeletedByRole = "OWNER" | "COMMUNITY_ADMIN" | "CREATOR" | "MODERATOR";
type Tx = Prisma.TransactionClient;

/** Delegate names in restore order (parents before children). */
type Table =
  | "fanbaseGroup"
  | "membershipPlan"
  | "communityChannel"
  | "membership"
  | "joinRequest"
  | "post"
  | "poll"
  | "pollVote"
  | "postLike"
  | "comment"
  | "commentVote"
  | "report"
  | "songComment"
  | "songCommentVote"
  | "collection"
  | "collectionItem"
  | "productAddOn"
  | "supportTicket"
  | "supportReply";

type Row = Record<string, unknown>;
type Snapshot = {
  tables: { table: Table; rows: Row[] }[];
  /** Rows that pointed at the item and were unlinked (not deleted) — relinked on restore. */
  relink?: { table: "post" | "report"; field: "replyToId" | "groupId"; ids: string[] }[];
};

export type ArchiveActor = { userId: string; role: DeletedByRole };

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Row[];
const clip = (s: string | null | undefined, n = 280) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : null);

async function save(
  tx: Tx,
  args: { kind: DeletedKind; targetId: string; ownerId: string | null; title: string; preview: string | null; snapshot: Snapshot; actor: ArchiveActor },
) {
  await tx.deletedContent.create({
    data: {
      kind: args.kind,
      targetId: args.targetId,
      ownerId: args.ownerId,
      deletedById: args.actor.userId,
      deletedByRole: args.actor.role,
      title: args.title,
      preview: args.preview,
      snapshot: args.snapshot as unknown as Prisma.InputJsonValue,
    },
  });
}

/** Posts + everything hanging off them (polls, votes, likes, comments, reports). */
async function postTables(tx: Tx, postIds: string[]) {
  if (postIds.length === 0) return [];
  const [posts, polls, votes, likes, comments, reports, commentVotes] = await Promise.all([
    tx.post.findMany({ where: { id: { in: postIds } } }),
    tx.poll.findMany({ where: { postId: { in: postIds } } }),
    tx.pollVote.findMany({ where: { pollId: { in: postIds } } }),
    tx.postLike.findMany({ where: { postId: { in: postIds } } }),
    tx.comment.findMany({ where: { postId: { in: postIds } } }),
    tx.report.findMany({ where: { postId: { in: postIds } } }),
    tx.commentVote.findMany({ where: { comment: { postId: { in: postIds } } } }),
  ]);
  // Top-level comments before replies so restore inserts parents first.
  comments.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
  // Originals before reposts/replies so restore inserts parents first.
  const order = new Map(postIds.map((id, i) => [id, i]));
  posts.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return [
    { table: "post" as const, rows: json(posts) },
    { table: "poll" as const, rows: json(polls) },
    { table: "pollVote" as const, rows: json(votes) },
    { table: "postLike" as const, rows: json(likes) },
    { table: "comment" as const, rows: json(comments) },
    { table: "commentVote" as const, rows: json(commentVotes) },
    { table: "report" as const, rows: json(reports) },
  ];
}

export async function archivePost(tx: Tx, postId: string, actor: ArchiveActor) {
  const post = await tx.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, body: true, imageUrl: true, groupId: true } });
  if (!post) return;
  const [reposts, replies] = await Promise.all([
    tx.post.findMany({ where: { repostOfId: postId }, select: { id: true } }),
    tx.post.findMany({ where: { replyToId: postId }, select: { id: true } }),
  ]);
  await save(tx, {
    kind: "POST",
    targetId: postId,
    ownerId: post.authorId,
    title: post.groupId ? "Community message" : "Socials post",
    preview: clip(post.body) ?? (post.imageUrl ? "[photo]" : null),
    snapshot: {
      tables: await postTables(tx, [postId, ...reposts.map((r) => r.id)]),
      relink: replies.length ? [{ table: "post", field: "replyToId", ids: replies.map((r) => r.id) }] : [],
    },
    actor,
  });
}

/** A song comment, its replies (deleted with it by the database) and all their votes. */
export async function archiveSongComment(tx: Tx, commentId: string, actor: ArchiveActor) {
  const comment = await tx.songComment.findUnique({ where: { id: commentId } });
  if (!comment) return;
  const replies = await tx.songComment.findMany({ where: { parentId: commentId } });
  const ids = [commentId, ...replies.map((r) => r.id)];
  const votes = await tx.songCommentVote.findMany({ where: { commentId: { in: ids } } });
  await save(tx, {
    kind: "SONG_COMMENT",
    targetId: commentId,
    ownerId: comment.authorId,
    title: comment.parentId ? "Song comment reply" : "Song comment",
    preview: clip(comment.body),
    snapshot: {
      tables: [
        { table: "songComment", rows: json([comment, ...replies]) },
        { table: "songCommentVote", rows: json(votes) },
      ],
    },
    actor,
  });
}

/** A Socials/community post comment, its replies and all their likes. */
export async function archivePostComment(tx: Tx, commentId: string, actor: ArchiveActor) {
  const comment = await tx.comment.findUnique({ where: { id: commentId } });
  if (!comment) return;
  const replies = await tx.comment.findMany({ where: { parentId: commentId } });
  const ids = [commentId, ...replies.map((r) => r.id)];
  const votes = await tx.commentVote.findMany({ where: { commentId: { in: ids } } });
  await save(tx, {
    kind: "COMMENT",
    targetId: commentId,
    ownerId: comment.authorId,
    title: comment.parentId ? "Post comment reply" : "Post comment",
    preview: clip(comment.body),
    snapshot: {
      tables: [
        { table: "comment", rows: json([comment, ...replies]) },
        { table: "commentVote", rows: json(votes) },
      ],
    },
    actor,
  });
}

/** An item in the XOLDOUT channel and its conversation (super admin delete, 2026-11-13). */
export async function archiveSupportTicket(tx: Tx, ticketId: string, actor: ArchiveActor) {
  const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) return;
  const replies = await tx.supportReply.findMany({ where: { ticketId } });
  await save(tx, {
    kind: "FEEDBACK",
    targetId: ticketId,
    ownerId: ticket.authorId,
    title: ticket.title,
    preview: clip(ticket.body),
    snapshot: {
      tables: [
        { table: "supportTicket", rows: json([ticket]) },
        { table: "supportReply", rows: json(replies) },
      ],
    },
    actor,
  });
}

export async function archiveCollection(tx: Tx, collectionId: string, actor: ArchiveActor) {
  const collection = await tx.collection.findUnique({ where: { id: collectionId }, include: { items: true } });
  if (!collection) return;
  const { items, ...row } = collection;
  await save(tx, {
    kind: "PLAYLIST",
    targetId: collectionId,
    ownerId: collection.userId,
    title: collection.name,
    preview: `${items.length} song${items.length === 1 ? "" : "s"}`,
    snapshot: {
      tables: [
        { table: "collection", rows: json([row]) },
        { table: "collectionItem", rows: json(items) },
      ],
    },
    actor,
  });
}

export async function archiveAddOn(tx: Tx, addOnId: string, productId: string, actor: ArchiveActor) {
  const addOn = await tx.productAddOn.findFirst({ where: { id: addOnId, productId }, include: { product: { select: { creatorId: true, title: true } } } });
  if (!addOn) return;
  const { product, ...row } = addOn;
  await save(tx, {
    kind: "ADD_ON",
    targetId: addOnId,
    ownerId: product.creatorId,
    title: addOn.title,
    preview: `Extra on "${product.title}"`,
    snapshot: { tables: [{ table: "productAddOn", rows: json([row]) }] },
    actor,
  });
}

export async function archiveCommunity(tx: Tx, groupId: string, actor: ArchiveActor) {
  const group = await tx.fanbaseGroup.findUnique({ where: { id: groupId } });
  if (!group) return;
  const [plans, channels, memberships, joinRequests, posts, communityReports] = await Promise.all([
    tx.membershipPlan.findMany({ where: { groupId } }),
    tx.communityChannel.findMany({ where: { groupId } }),
    // Saved card tokens are never copied into the archive; a restored
    // membership falls back to the renewal reminder.
    tx.membership.findMany({ where: { groupId }, omit: { cardToken: true, cardProcessor: true, cardEmail: true } }),
    tx.joinRequest.findMany({ where: { groupId } }),
    tx.post.findMany({ where: { groupId }, select: { id: true, replyToId: true }, orderBy: { createdAt: "asc" } }),
    tx.report.findMany({ where: { groupId, postId: null }, select: { id: true } }),
  ]);
  await save(tx, {
    kind: "COMMUNITY",
    targetId: groupId,
    ownerId: group.creatorId,
    title: group.name,
    preview: `${memberships.length} member${memberships.length === 1 ? "" : "s"} · ${posts.length} message${posts.length === 1 ? "" : "s"}`,
    snapshot: {
      tables: [
        { table: "fanbaseGroup", rows: json([group]) },
        { table: "membershipPlan", rows: json(plans) },
        { table: "communityChannel", rows: json(channels) },
        { table: "membership", rows: json(memberships) },
        { table: "joinRequest", rows: json(joinRequests) },
        ...(await postTables(tx, posts.map((p) => p.id))),
      ],
      // Reports about the community itself are kept by the database (groupId set to null).
      relink: communityReports.length ? [{ table: "report", field: "groupId", ids: communityReports.map((r) => r.id) }] : [],
    },
    actor,
  });
}

// ─── Restore ────────────────────────────────────────────────────────────────

export class RestoreError extends Error {}

const USER_FIELDS = ["userId", "authorId", "reporterId", "profileId", "creatorId"] as const;

/** Nulls are dropped so optional/Json columns take their database default (null). */
function clean(rows: Row[]) {
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)));
}

export async function restoreDeleted(recordId: string, restoredById: string) {
  const record = await db.deletedContent.findUnique({ where: { id: recordId } });
  if (!record) throw new RestoreError("Not found");
  if (record.restoredAt) throw new RestoreError("This was already restored");
  const snapshot = record.snapshot as unknown as Snapshot;
  const tables = snapshot.tables.map((t) => ({ table: t.table, rows: clean(t.rows) }));
  const main = tables[0]?.rows[0];
  if (!main) throw new RestoreError("Nothing to restore");

  // People who've since been removed for good can't be pointed at again.
  const userIds = new Set<string>();
  for (const t of tables) for (const r of t.rows) for (const f of USER_FIELDS) if (typeof r[f] === "string") userIds.add(r[f] as string);
  const existingUsers = new Set((await db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true } })).map((u) => u.id));
  const usersOk = (r: Row) => USER_FIELDS.every((f) => typeof r[f] !== "string" || existingUsers.has(r[f] as string));
  if (!usersOk(main)) throw new RestoreError("The account that owned this no longer exists");

  await db.$transaction(async (tx) => {
    await preflight(tx, record.kind as DeletedKind, main, tables);
    for (const { table, rows } of tables) {
      const data = rows.filter(usersOk);
      if (data.length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one generic insert per archived table
      await (tx[table] as any).createMany({ data, skipDuplicates: true });
    }
    for (const r of snapshot.relink ?? []) {
      if (r.ids.length === 0) continue;
      if (r.table === "post") await tx.post.updateMany({ where: { id: { in: r.ids }, replyToId: null }, data: { replyToId: record.targetId } });
      else await tx.report.updateMany({ where: { id: { in: r.ids }, groupId: null }, data: { groupId: record.targetId } });
    }
    await afterRestore(tx, record.kind as DeletedKind, main, tables);
    await tx.deletedContent.update({ where: { id: recordId }, data: { restoredAt: new Date(), restoredById } });
  });
  return { kind: record.kind, targetId: record.targetId };
}

/** Checks the things the restored rows depend on still exist; adjusts rows that point at removed ones. */
async function preflight(tx: Tx, kind: DeletedKind, main: Row, tables: { table: Table; rows: Row[] }[]) {
  if (kind === "POST") {
    if (typeof main.groupId === "string" && !(await tx.fanbaseGroup.findUnique({ where: { id: main.groupId }, select: { id: true } }))) {
      throw new RestoreError("The community this was posted in has been deleted. Restore the community first.");
    }
    const posts = tables.find((t) => t.table === "post")?.rows ?? [];
    const own = new Set(posts.map((p) => p.id as string));
    const refs = [...new Set(posts.flatMap((p) => [p.replyToId, p.repostOfId]).filter((x): x is string => typeof x === "string" && !own.has(x)))];
    const channels = [...new Set(posts.map((p) => p.channelId).filter((x): x is string => typeof x === "string"))];
    const [livePosts, liveChannels] = await Promise.all([
      tx.post.findMany({ where: { id: { in: refs } }, select: { id: true } }),
      tx.communityChannel.findMany({ where: { id: { in: channels } }, select: { id: true } }),
    ]);
    const okPosts = new Set(livePosts.map((p) => p.id));
    const okChannels = new Set(liveChannels.map((c) => c.id));
    if (typeof main.repostOfId === "string" && !own.has(main.repostOfId) && !okPosts.has(main.repostOfId)) {
      throw new RestoreError("The post this reposted has been deleted. Restore that post first.");
    }
    for (const p of posts) {
      if (typeof p.replyToId === "string" && !own.has(p.replyToId) && !okPosts.has(p.replyToId)) delete p.replyToId;
      if (typeof p.channelId === "string" && !okChannels.has(p.channelId)) delete p.channelId; // channel removed → General
    }
  }
  if (kind === "COMMENT") {
    if (!(await tx.post.findUnique({ where: { id: main.postId as string }, select: { id: true } }))) {
      throw new RestoreError("The post this was on has been deleted. Restore the post first.");
    }
    if (typeof main.parentId === "string" && !(await tx.comment.findUnique({ where: { id: main.parentId }, select: { id: true } }))) {
      throw new RestoreError("The comment this replied to has been deleted. Restore that comment first.");
    }
  }
  if (kind === "SONG_COMMENT" && typeof main.parentId === "string") {
    if (!(await tx.songComment.findUnique({ where: { id: main.parentId }, select: { id: true } }))) {
      throw new RestoreError("The comment this replied to has been deleted. Restore that comment first.");
    }
  }
  if (kind === "ADD_ON") {
    const product = await tx.product.findUnique({ where: { id: main.productId as string }, select: { status: true } });
    if (!product || product.status === "DELETED") throw new RestoreError("The release this extra belongs to is deleted. Restore the release first.");
  }
  if (kind === "PLAYLIST") {
    const items = tables.find((t) => t.table === "collectionItem");
    if (items && items.rows.length) {
      const live = new Set(
        (await tx.entitlement.findMany({ where: { id: { in: items.rows.map((r) => r.entitlementId as string) } }, select: { id: true } })).map((e) => e.id),
      );
      items.rows = items.rows.filter((r) => live.has(r.entitlementId as string));
    }
  }
  if (kind === "COMMUNITY") {
    // Another community may have taken the handle or invite code since.
    const [handle, invite] = await Promise.all([
      typeof main.handle === "string" ? tx.fanbaseGroup.findUnique({ where: { handle: main.handle }, select: { id: true } }) : null,
      typeof main.inviteCode === "string" ? tx.fanbaseGroup.findUnique({ where: { inviteCode: main.inviteCode }, select: { id: true } }) : null,
    ]);
    if (handle) delete main.handle;
    if (invite) delete main.inviteCode;
    const memberships = tables.find((t) => t.table === "membership");
    if (memberships?.rows.length) {
      const codes = memberships.rows.map((r) => r.cardCode).filter((x): x is string => typeof x === "string");
      const taken = new Set((await tx.membership.findMany({ where: { cardCode: { in: codes } }, select: { cardCode: true } })).map((m) => m.cardCode));
      for (const r of memberships.rows) if (typeof r.cardCode === "string" && taken.has(r.cardCode)) delete r.cardCode;
    }
  }
}

/** Counters that the delete decremented. */
async function afterRestore(tx: Tx, kind: DeletedKind, main: Row, tables: { table: Table; rows: Row[] }[]) {
  if (kind === "SONG_COMMENT" && typeof main.parentId === "string") {
    await tx.songComment.update({ where: { id: main.parentId }, data: { replyCount: { increment: 1 } } });
  }
  if (kind === "COMMENT" && typeof main.parentId === "string") {
    await tx.comment.update({ where: { id: main.parentId }, data: { replyCount: { increment: 1 } } });
  }
  if (kind === "ADD_ON") {
    await tx.product.update({ where: { id: main.productId as string }, data: { addOnCount: { increment: 1 } } });
  }
  void tables;
}

// ─── Listing ────────────────────────────────────────────────────────────────

export type DeletedListItem = {
  id: string;
  source: "ARCHIVE" | "PRODUCT" | "EVENT";
  kind: string;
  title: string;
  preview: string | null;
  owner: { handle: string; displayName: string } | null;
  deletedBy: { handle: string; displayName: string } | null;
  deletedByRole: string;
  deletedAt: string;
  restoredAt: string | null;
  canRestore: boolean;
  note: string | null;
  link: string | null;
};

const PRODUCT_KINDS = { RELEASE: "RELEASE", BEAT: "BEAT", MERCH: "MERCH" } as const;
const PRODUCT_PATH: Record<string, string> = { RELEASE: "r", BEAT: "b", MERCH: "m" };
export const DELETED_FILTERS = ["ALL", "POST", "COMMENT", "FEEDBACK", "SONG_COMMENT", "COMMUNITY", "PLAYLIST", "ADD_ON", "RELEASE", "BEAT", "MERCH", "EVENT"] as const;
export type DeletedFilter = (typeof DELETED_FILTERS)[number];

/**
 * Newest-deleted first across the archive and the already-soft-deleted
 * products and events. Paged by `before` (an ISO date). One query per source
 * plus one user lookup — never per row.
 */
export async function listDeleted(args: { filter: DeletedFilter; q: string; before: Date | null; take?: number }) {
  const take = args.take ?? 30;
  const q = args.q.trim().replace(/^@/, "");
  const before = args.before ?? undefined;
  const wantArchive = args.filter === "ALL" || ["POST", "COMMENT", "FEEDBACK", "SONG_COMMENT", "COMMUNITY", "PLAYLIST", "ADD_ON"].includes(args.filter);
  const wantProducts = args.filter === "ALL" || args.filter in PRODUCT_KINDS;
  const wantEvents = args.filter === "ALL" || args.filter === "EVENT";

  // Search by owner handle: resolve matching users once.
  const ownerIds = q ? (await db.user.findMany({ where: { handle: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 50 })).map((u) => u.id) : [];

  const [archive, products, events] = await Promise.all([
    wantArchive
      ? db.deletedContent.findMany({
          where: {
            ...(args.filter !== "ALL" ? { kind: args.filter } : {}),
            ...(before ? { deletedAt: { lt: before } } : {}),
            ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { preview: { contains: q, mode: "insensitive" } }, { ownerId: { in: ownerIds } }] } : {}),
          },
          omit: { snapshot: true },
          orderBy: { deletedAt: "desc" },
          take,
        })
      : [],
    wantProducts
      ? db.product.findMany({
          where: {
            status: "DELETED",
            type: args.filter === "ALL" ? { in: ["RELEASE", "BEAT", "MERCH"] } : (args.filter as "RELEASE" | "BEAT" | "MERCH"),
            ...(before ? { deletedAt: { lt: before } } : {}),
            ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { creatorId: { in: ownerIds } }] } : {}),
          },
          select: { id: true, type: true, title: true, deletedAt: true, publishedAt: true, creatorId: true, _count: { select: { entitlements: { where: { revokedAt: { not: null } } } } } },
          orderBy: { deletedAt: "desc" },
          take,
        })
      : [],
    wantEvents
      ? db.event.findMany({
          where: {
            status: "DELETED",
            ...(before ? { deletedAt: { lt: before } } : {}),
            ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { creatorId: { in: ownerIds } }] } : {}),
          },
          select: { id: true, title: true, deletedAt: true, startsAt: true, creatorId: true },
          orderBy: { deletedAt: "desc" },
          take,
        })
      : [],
  ]);

  const people = new Set<string>();
  for (const a of archive) for (const id of [a.ownerId, a.deletedById]) if (id) people.add(id);
  for (const p of products) people.add(p.creatorId);
  for (const e of events) people.add(e.creatorId);
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: [...people] } }, select: { id: true, handle: true, displayName: true } })).map((u) => [u.id, { handle: u.handle, displayName: u.displayName }]),
  );
  const who = (id: string | null) => (id ? (users.get(id) ?? null) : null);

  const items: DeletedListItem[] = [
    ...archive.map((a) => ({
      id: a.id,
      source: "ARCHIVE" as const,
      kind: a.kind,
      title: a.title,
      preview: a.preview,
      owner: who(a.ownerId),
      deletedBy: who(a.deletedById),
      deletedByRole: a.deletedByRole,
      deletedAt: a.deletedAt.toISOString(),
      restoredAt: a.restoredAt?.toISOString() ?? null,
      canRestore: !a.restoredAt,
      note: null,
      link: null,
    })),
    ...products.map((p) => {
      // A moderator takedown refunds buyers and revokes their copies — that
      // can't be undone by flipping the status back, so it stays view-only.
      const takenDown = p._count.entitlements > 0;
      return {
        id: p.id,
        source: "PRODUCT" as const,
        kind: p.type,
        title: p.title,
        preview: null,
        owner: who(p.creatorId),
        // Products never recorded who deleted them: a refunded takedown is
        // a moderator's, anything else is the owner's or a no-buyer takedown.
        deletedBy: null,
        deletedByRole: takenDown ? "MODERATOR" : "UNRECORDED",
        deletedAt: (p.deletedAt ?? new Date(0)).toISOString(),
        restoredAt: null,
        canRestore: !takenDown,
        note: takenDown ? "Taken down with refunds; can't be restored" : null,
        link: `/${PRODUCT_PATH[p.type]}/${p.id}`,
      };
    }),
    ...events.map((e) => ({
      id: e.id,
      source: "EVENT" as const,
      kind: "EVENT",
      title: e.title,
      preview: `Event on ${e.startsAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}`,
      owner: who(e.creatorId),
      deletedBy: who(e.creatorId),
      deletedByRole: "OWNER", // only the organiser can delete an event
      deletedAt: (e.deletedAt ?? new Date(0)).toISOString(),
      restoredAt: null,
      canRestore: true,
      note: null,
      link: `/e/${e.id}`,
    })),
  ];
  items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const page = items.slice(0, take);
  return { items: page, nextBefore: items.length > take || page.length === take ? (page.at(-1)?.deletedAt ?? null) : null };
}

/** The full archived copy, for the admin "View" sheet. */
export async function getDeletedSnapshot(recordId: string) {
  const record = await db.deletedContent.findUnique({ where: { id: recordId } });
  if (!record) return null;
  const snapshot = record.snapshot as unknown as Snapshot;
  return { kind: record.kind, title: record.title, counts: Object.fromEntries(snapshot.tables.map((t) => [t.table, t.rows.length])), main: snapshot.tables[0]?.rows[0] ?? null, tables: snapshot.tables };
}

/** Restores an owner-deleted release/beat/merch listing. */
export async function restoreDeletedProduct(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { status: true, publishedAt: true, _count: { select: { entitlements: { where: { revokedAt: { not: null } } } } } },
  });
  if (!product || product.status !== "DELETED") throw new RestoreError("That item isn't deleted");
  if (product._count.entitlements > 0) throw new RestoreError("This was taken down with refunds, so it can't be restored");
  const status = product.publishedAt ? "PUBLISHED" : "DRAFT";
  await db.product.update({ where: { id: productId }, data: { status, deletedAt: null } });
  return { status };
}
