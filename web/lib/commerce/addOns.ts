import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { objectSize, presignDownload } from "@/lib/storage/r2";
import { ADD_ON_CONTENT_TYPES, ADD_ON_KINDS, MAX_ADD_ON_BYTES, MAX_ADD_ONS_PER_PRODUCT, parseYouTubeId } from "@/lib/commerce/addOnRules";

// Creative Add-ons (V1.2, explicit ask 2026-10-21): bonus content attached
// to a release — never sold on its own. Buying the release is what unlocks
// it, through the same Entitlement every other purchase uses.

export const addOnInputSchema = z
  .object({
    kind: z.enum(ADD_ON_KINDS),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    youtubeUrl: z.string().trim().max(300).optional(),
    fileKey: z.string().min(1).optional(),
    fileName: z.string().trim().min(1).max(200).optional(),
    contentType: z.enum(ADD_ON_CONTENT_TYPES).optional(),
  })
  .refine((a) => Boolean(a.youtubeUrl) !== Boolean(a.fileKey), { message: "Each extra needs either a YouTube link or an uploaded file" });

export type AddOnInput = z.infer<typeof addOnInputSchema>;

export class AddOnError extends Error {}

/**
 * Validates add-ons from the client and turns them into rows to create.
 * Checks what a presigned upload can't: the file really is this creator's
 * (key namespace), really exists, and is within the size cap.
 */
export async function prepareAddOns(creatorId: string, inputs: AddOnInput[], startOrder = 0) {
  return Promise.all(
    inputs.map(async (a, i) => {
      const base = { kind: a.kind, title: a.title, description: a.description || null, order: startOrder + i };
      if (a.youtubeUrl) {
        const youtubeId = parseYouTubeId(a.youtubeUrl);
        if (!youtubeId) throw new AddOnError(`"${a.title}": that doesn't look like a YouTube link`);
        return { ...base, youtubeId };
      }
      if (!a.fileKey!.startsWith(`addons/${creatorId}/`)) throw new AddOnError(`"${a.title}": file not found`);
      const size = await objectSize(a.fileKey!);
      if (size === null) throw new AddOnError(`"${a.title}": the upload didn't finish — try again`);
      if (size > MAX_ADD_ON_BYTES) throw new AddOnError(`"${a.title}" is over the 100 MB limit — use a YouTube link for long videos`);
      return {
        ...base,
        fileKey: a.fileKey!,
        fileName: a.fileName ?? a.fileKey!.split("/").pop()!,
        contentType: a.contentType ?? "application/octet-stream",
        sizeBytes: size,
      };
    }),
  );
}

/** Creates add-ons for a product and keeps Product.addOnCount in step. */
export async function createAddOns(tx: Prisma.TransactionClient, productId: string, rows: Awaited<ReturnType<typeof prepareAddOns>>) {
  if (rows.length === 0) return;
  await tx.productAddOn.createMany({ data: rows.map((r) => ({ ...r, productId })) });
  await tx.product.update({ where: { id: productId }, data: { addOnCount: { increment: rows.length } } });
}

export function assertAddOnRoom(existing: number, adding: number) {
  if (existing + adding > MAX_ADD_ONS_PER_PRODUCT) throw new AddOnError(`A release can have up to ${MAX_ADD_ONS_PER_PRODUCT} extras`);
}

/** Owner of the release, or a buyer whose entitlement hasn't been revoked. */
export async function canAccessAddOns(userId: string | null, product: { id: string; creatorId: string }) {
  if (!userId) return false;
  if (userId === product.creatorId) return true;
  const entitlement = await db.entitlement.findFirst({ where: { userId, productId: product.id, revokedAt: null }, select: { id: true } });
  return Boolean(entitlement);
}

const LINK_TTL_SECONDS = 60 * 60;

/**
 * Add-ons for the product page. Everyone sees what's included (kind, title,
 * description, size) — that's the selling point. Only a buyer or the creator
 * gets the YouTube id and signed links; a YouTube link stays hidden from
 * non-buyers too, so it isn't handed out for free.
 */
export async function listAddOnsFor(productId: string, unlocked: boolean) {
  const rows = await db.productAddOn.findMany({ where: { productId }, orderBy: { order: "asc" } });
  return Promise.all(
    rows.map(async (a) => {
      const base = {
        id: a.id,
        kind: a.kind,
        title: a.title,
        description: a.description,
        isVideoLink: Boolean(a.youtubeId),
        fileName: a.fileName,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
      };
      if (!unlocked) return { ...base, youtubeId: null, viewUrl: null, downloadUrl: null };
      return {
        ...base,
        youtubeId: a.youtubeId,
        viewUrl: a.fileKey ? await presignDownload(a.fileKey, LINK_TTL_SECONDS, { contentType: a.contentType ?? undefined }) : null,
        downloadUrl: a.fileKey
          ? await presignDownload(a.fileKey, LINK_TTL_SECONDS, { filename: safeFileName(a.fileName ?? "extra"), contentType: a.contentType ?? undefined })
          : null,
      };
    }),
  );
}

function safeFileName(name: string) {
  // ASCII only: this lands in a Content-Disposition header via the signed URL.
  return name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "").slice(0, 150) || "extra";
}
