import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications/create";
import { MAX_FEATURED_ARTISTS, collaboratorSharesError } from "@/lib/music/collabRules";

// Featured artists & revenue sharing (explicit ask, 2026-11-06). Model and
// rules: prisma/schema.prisma's ReleaseCollaborator; shared numbers:
// lib/music/collabRules.ts.

export const collaboratorInputSchema = z
  .object({
    artistId: z.string().min(1),
    arrangement: z.enum(["ROYALTY_SPLIT", "CREDIT_ONLY"]),
    sharePercent: z.number().int().min(0).max(100).default(0),
  })
  .transform((c) => (c.arrangement === "CREDIT_ONLY" ? { ...c, sharePercent: 0 } : c));

export type CollaboratorInput = z.infer<typeof collaboratorInputSchema>;

export class CollaboratorError extends Error {}

/** Checks tags before the release is written; throws CollaboratorError. */
export async function validateCollaborators(mainArtistId: string, inputs: CollaboratorInput[]) {
  if (inputs.length === 0) return;
  if (inputs.length > MAX_FEATURED_ARTISTS) throw new CollaboratorError(`You can tag up to ${MAX_FEATURED_ARTISTS} featured artists`);
  const sharesError = collaboratorSharesError(inputs);
  if (sharesError) throw new CollaboratorError(sharesError);
  const ids = inputs.map((c) => c.artistId);
  if (new Set(ids).size !== ids.length) throw new CollaboratorError("Each featured artist can only be tagged once");
  if (ids.includes(mainArtistId)) throw new CollaboratorError("You can't tag yourself as a featured artist");
  const found = await db.user.count({ where: { id: { in: ids }, pendingGuestAt: null } });
  if (found !== ids.length) throw new CollaboratorError("One of the featured artists couldn't be found");
}

export async function createCollaborators(
  tx: Prisma.TransactionClient,
  args: { productId: string; mainArtistId: string; inputs: CollaboratorInput[] },
) {
  if (args.inputs.length === 0) return;
  await tx.releaseCollaborator.createMany({
    data: args.inputs.map((c) => ({
      productId: args.productId,
      artistId: c.artistId,
      invitedById: args.mainArtistId,
      arrangement: c.arrangement,
      sharePercent: c.sharePercent,
    })),
  });
}

/** Bell + push to each tagged artist, after the release is committed. */
export async function notifyCollaborationRequests(args: {
  productId: string;
  title: string;
  mainArtistName: string;
  inputs: CollaboratorInput[];
}) {
  const royalty = args.inputs.filter((c) => c.arrangement === "ROYALTY_SPLIT");
  const credit = args.inputs.filter((c) => c.arrangement === "CREDIT_ONLY");
  const base = { kind: "COLLABORATION" as const, title: "Featured artist request", url: "/profile/collaborations" };
  // One push per distinct share so each artist sees their own percentage.
  const byShare = new Map<number, string[]>();
  for (const c of royalty) byShare.set(c.sharePercent, [...(byShare.get(c.sharePercent) ?? []), c.artistId]);
  await Promise.all([
    ...[...byShare].map(([share, ids]) =>
      notifyUsers(ids, { ...base, body: `${args.mainArtistName} tagged you on "${args.title}" with a ${share}% royalty share. Review to accept.` }),
    ),
    notifyUsers(
      credit.map((c) => c.artistId),
      { ...base, body: `${args.mainArtistName} tagged you as a featured artist on "${args.title}" (credit only). Review to accept.` },
    ),
  ]);
}

/**
 * The accepted royalty splits for one release, read inside the sale's own
 * transaction (lib/commerce/confirmPayment.ts → recordSale) so the split and
 * the sale it applies to commit together.
 */
export async function getRoyaltySplits(tx: Prisma.TransactionClient | typeof db, productId: string) {
  return tx.releaseCollaborator.findMany({
    where: { productId, status: "ACCEPTED", arrangement: "ROYALTY_SPLIT", sharePercent: { gt: 0 } },
    select: { artistId: true, sharePercent: true },
  });
}

/** Public credit line — accepted tags only, pending/declined never show. */
export const acceptedCreditsSelect = {
  where: { status: "ACCEPTED" as const },
  orderBy: { createdAt: "asc" as const },
  select: { artist: { select: { id: true, handle: true, displayName: true } } },
};
