import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generatePreviewClip } from "@/lib/audio/generatePreviewClip";

export const maxDuration = 120; // trimming a real preview clip (ffmpeg), mirrors the ingest route's own limit

const createSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    priceKobo: z.number().int().min(0), // 0 = free, first-class per PRD §7.1
    cap: z.number().int().positive().nullable(),
    coverImageLadder: z.record(z.string(), z.string()),
    audioMasterKey: z.string().min(1),
    audioStreamKey: z.string().min(1),
    waveformPeaksKey: z.string().min(1),
    durationSec: z.number().positive(),
    previewStartSec: z.number().min(0),
    previewEndSec: z.number().positive(),
    bpm: z.number().int().positive().optional(),
    musicalKey: z.string().max(10).optional(),
    tags: z.array(z.string().max(24)).max(8).default([]),
  })
  .refine((b) => b.previewEndSec > b.previewStartSec, { message: "previewEndSec must exceed previewStartSec" })
  .refine((b) => b.previewEndSec <= b.durationSec, { message: "preview window exceeds beat duration" });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = createSchema.parse(await req.json());

    // Cut before the DB write, not inside the transaction below — this is
    // R2 + ffmpeg I/O that shouldn't hold a database connection open.
    const previewAudioKey = await generatePreviewClip(user.id, body.audioStreamKey, body.previewStartSec, body.previewEndSec);

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          creatorId: user.id,
          type: "BEAT",
          title: body.title,
          description: body.description,
          priceKobo: body.priceKobo,
          status: "PUBLISHED",
          publishedAt: new Date(),
          beat: {
            create: {
              coverImageLadder: body.coverImageLadder,
              audioMasterUrl: body.audioMasterKey,
              audioStreamUrl: body.audioStreamKey,
              previewAudioUrl: previewAudioKey,
              waveformPeaksUrl: body.waveformPeaksKey,
              durationSec: body.durationSec,
              previewStartSec: body.previewStartSec,
              previewEndSec: body.previewEndSec,
              bpm: body.bpm,
              musicalKey: body.musicalKey,
              tags: body.tags,
            },
          },
          stockPolicy: { create: { cap: body.cap } },
        },
        include: { beat: true, stockPolicy: true },
      });
      return created;
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not publish beat" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const products = await db.product.findMany({
      where: { creatorId: user.id, type: "BEAT" },
      include: { beat: true, stockPolicy: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
