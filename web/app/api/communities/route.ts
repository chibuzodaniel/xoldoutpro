import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getOptionalUser, requireUser, AuthError } from "@/lib/auth/session";
import { getObjectBuffer, putObjectBuffer, publicUrlFor } from "@/lib/storage/r2";
import { resizeBanner, resizeSquare } from "@/lib/images";
import { MAX_CHANNELS, MAX_PLANS, MIN_PAID_PLAN_KOBO } from "@/lib/communities/constants";
import { newInviteCode } from "@/lib/communities/server";
import { db } from "@/lib/db";
import { COMMUNITY_CATEGORIES, DIRECTORY_FILTERS, type DirectoryFilter } from "@/lib/communities/constants";

// Socials → Communities directory (v2, design/v2-prototype). Every Fanbase is
// a community. Public: signed-out visitors can browse too. One query plus one
// for the viewer's own status — nothing per row.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().slice(0, 60) || null;
  const filterParam = sp.get("filter");
  const filter = DIRECTORY_FILTERS.some((f) => f.key === filterParam) ? (filterParam as DirectoryFilter) : null;
  const categoryParam = sp.get("category");
  const category = (COMMUNITY_CATEGORIES as readonly string[]).includes(categoryParam ?? "") ? categoryParam : null;

  const livePaidPlan = { priceKobo: { gt: 0 }, archivedAt: null };
  const where: Prisma.FanbaseGroupWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { handle: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
    ...(filter === "featured" ? { isFeatured: true } : {}),
    ...(filter === "paid" ? { plans: { some: livePaidPlan } } : {}),
    ...(filter === "free" ? { plans: { none: livePaidPlan } } : {}),
  };
  const orderBy: Prisma.FanbaseGroupOrderByWithRelationInput[] =
    filter === "new"
      ? [{ createdAt: "desc" }]
      : filter === "trending"
        ? [{ memberships: { _count: "desc" } }, { createdAt: "desc" }]
        : [{ isFeatured: "desc" }, { memberships: { _count: "desc" } }, { createdAt: "desc" }];

  const groups = await db.fanbaseGroup.findMany({
    where,
    orderBy,
    take: 40,
    select: {
      id: true,
      handle: true,
      name: true,
      description: true,
      coverImageUrl: true,
      bannerUrl: true,
      category: true,
      isFeatured: true,
      isVerified: true,
      visibility: true,
      creator: { select: { displayName: true, handle: true } },
      _count: { select: { memberships: true } },
      plans: { where: { archivedAt: null }, select: { priceKobo: true } },
    },
  });

  const user = await getOptionalUser(req);
  const ids = groups.map((g) => g.id);
  const [mine, requests] = user
    ? await Promise.all([
        db.membership.findMany({ where: { userId: user.id, groupId: { in: ids } }, select: { groupId: true, expiresAt: true, suspendedAt: true } }),
        db.joinRequest.findMany({ where: { userId: user.id, groupId: { in: ids }, status: { in: ["PENDING", "APPROVED"] } }, select: { groupId: true, status: true } }),
      ])
    : [[], []];
  const now = Date.now();
  const memberOf = new Map(mine.map((m) => [m.groupId, !m.suspendedAt && (!m.expiresAt || m.expiresAt.getTime() > now)]));
  const requestOf = new Map(requests.map((r) => [r.groupId, r.status]));

  return NextResponse.json({
    communities: groups.map((g) => {
      const paid = g.plans.filter((p) => p.priceKobo > 0).map((p) => p.priceKobo);
      return {
        id: g.id,
        handle: g.handle,
        name: g.name,
        description: g.description,
        logoUrl: g.coverImageUrl,
        bannerUrl: g.bannerUrl,
        category: g.category,
        isFeatured: g.isFeatured,
        isVerified: g.isVerified,
        isPrivate: g.visibility === "REQUEST_TO_JOIN",
        owner: g.creator,
        memberCount: g._count.memberships,
        isPaid: paid.length > 0,
        hasFreePlan: g.plans.length === 0 || g.plans.some((p) => p.priceKobo === 0),
        fromPriceKobo: paid.length ? Math.min(...paid) : null,
        myStatus: memberOf.get(g.id) ? "member" : memberOf.has(g.id) ? "expired" : requestOf.get(g.id) === "PENDING" ? "pending" : requestOf.get(g.id) === "APPROVED" ? "approved" : null,
      };
    }),
  });
}

// Create a community from the 5-step wizard (v2, design/v2-prototype):
// details, logo + cover, privacy, plans and topic channels in one request.
// (POST /api/groups — the mobile app's simple "create Fanbase" — still works.)
const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.]{3,30}$/, "Handle: 3–30 letters, numbers, dots or underscores")
    .optional()
    .nullable(),
  description: z.string().trim().max(1000).default(""),
  category: z.enum(COMMUNITY_CATEGORIES).optional().nullable(),
  location: z.string().trim().max(80).optional().nullable(),
  rules: z.string().trim().max(3000).optional().nullable(),
  isPrivate: z.boolean().default(false),
  logoKey: z.string().optional(),
  bannerKey: z.string().optional(),
  plans: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        description: z.string().trim().max(200).optional().nullable(),
        priceKobo: z
          .number()
          .int()
          .min(0)
          .max(100_000_000)
          .refine((k) => k === 0 || k >= MIN_PAID_PLAN_KOBO, "Paid plans need at least ₦100."),
        cycle: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]),
        benefits: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
        capacity: z.number().int().min(1).max(1_000_000).nullable().optional(),
        requiresApproval: z.boolean().default(false),
      }),
    )
    .max(MAX_PLANS)
    .default([]),
  // Topic channels: name plus the indexes (into plans) that can open it.
  topics: z
    .array(z.object({ name: z.string().trim().min(1).max(40), planIndexes: z.array(z.number().int().min(0)).max(MAX_PLANS).default([]) }))
    .max(MAX_CHANNELS - 1)
    .default([]),
});

async function finalizeImage(key: string, userId: string, kind: "logo" | "banner") {
  if (!key.startsWith(`avatars/${userId}/`)) throw new Error("bad-key");
  const original = await getObjectBuffer(key);
  const out = kind === "logo" ? await resizeSquare(original, 512) : await resizeBanner(original, 1500, 500);
  const derivativeKey = `avatars/${userId}/${randomUUID()}-${kind}.jpg`;
  await putObjectBuffer(derivativeKey, out, "image/jpeg");
  return publicUrlFor(derivativeKey);
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = createSchema.parse(await req.json());
    if (body.handle) {
      const taken = await db.fanbaseGroup.findFirst({ where: { handle: body.handle }, select: { id: true } });
      if (taken) return NextResponse.json({ error: "That handle is taken" }, { status: 409 });
    }
    let coverImageUrl: string | null = null;
    let bannerUrl: string | null = null;
    try {
      [coverImageUrl, bannerUrl] = await Promise.all([
        body.logoKey ? finalizeImage(body.logoKey, user.id, "logo") : Promise.resolve(null),
        body.bannerKey ? finalizeImage(body.bannerKey, user.id, "banner") : Promise.resolve(null),
      ]);
    } catch {
      return NextResponse.json({ error: "Couldn't use that image" }, { status: 400 });
    }

    const group = await db.$transaction(async (tx) => {
      const created = await tx.fanbaseGroup.create({
        data: {
          creatorId: user.id,
          name: body.name,
          handle: body.handle || null,
          description: body.description || null,
          category: body.category ?? null,
          location: body.location || null,
          rules: body.rules || null,
          visibility: body.isPrivate ? "REQUEST_TO_JOIN" : "OPEN",
          coverImageUrl,
          bannerUrl,
          inviteCode: newInviteCode(),
        },
      });
      await tx.membership.create({ data: { groupId: created.id, userId: user.id, role: "ADMIN" } });
      const planIds: string[] = [];
      for (const [order, p] of body.plans.entries()) {
        const plan = await tx.membershipPlan.create({
          data: {
            groupId: created.id,
            name: p.name,
            description: p.description || null,
            priceKobo: p.priceKobo,
            cycle: p.cycle,
            benefits: p.benefits,
            capacity: p.capacity ?? null,
            requiresApproval: p.requiresApproval,
            order,
          },
        });
        planIds.push(plan.id);
      }
      await tx.communityChannel.createMany({
        data: [
          { groupId: created.id, name: "Announcements", kind: "ANNOUNCEMENTS", order: 0 },
          ...body.topics.map((t, i) => ({
            groupId: created.id,
            name: t.name,
            kind: "DISCUSSION",
            order: i + 1,
            planIds: t.planIndexes.map((ix) => planIds[ix]).filter((x): x is string => Boolean(x)),
          })),
        ],
      });
      return created;
    });
    return NextResponse.json({ community: { id: group.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Check the details" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not create the community" }, { status: 500 });
  }
}
