import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const trackSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    order: z.number().int().min(0),
    audioMasterKey: z.string().min(1),
    audioStreamKey: z.string().min(1),
    waveformPeaksKey: z.string().min(1),
    durationSec: z.number().positive(),
    previewStartSec: z.number().min(0),
    previewEndSec: z.number().positive(),
    lyricsText: z.string().max(10000).optional(),
  })
  .refine((t) => t.previewEndSec > t.previewStartSec, { message: "previewEndSec must exceed previewStartSec" })
  .refine((t) => t.previewEndSec <= t.durationSec, { message: "preview window exceeds track duration" });

const createSchema = z
  .object({
    title: z.string().min(1).max(200),
    releaseType: z.enum(["SINGLE", "EP", "ALBUM"]),
    description: z.string().max(2000),
    priceKobo: z.number().int().min(0), // 0 = free, first-class per PRD §7.1
    cap: z.number().int().positive().nullable(),
    artworkLadder: z.record(z.string(), z.string()),
    tracks: z.array(trackSchema).min(1).max(30), // should-know default: 30 tracks/release
  })
  .refine((r) => r.releaseType !== "SINGLE" || r.tracks.length === 1, {
    message: "A single must have exactly one track",
  });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = createSchema.parse(await req.json());

    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          creatorId: user.id,
          type: "RELEASE",
          title: body.title,
          description: body.description,
          priceKobo: body.priceKobo,
          status: "PUBLISHED",
          publishedAt: new Date(),
          release: {
            create: {
              releaseType: body.releaseType,
              artworkLadder: body.artworkLadder,
              tracks: {
                create: body.tracks.map((t) => ({
                  order: t.order,
                  title: t.title,
                  description: t.description,
                  audioMasterUrl: t.audioMasterKey,
                  audioStreamUrl: t.audioStreamKey,
                  waveformPeaksUrl: t.waveformPeaksKey,
                  durationSec: t.durationSec,
                  previewStartSec: t.previewStartSec,
                  previewEndSec: t.previewEndSec,
                  lyricsText: t.lyricsText,
                })),
              },
            },
          },
          stockPolicy: { create: { cap: body.cap } },
        },
        include: { release: { include: { tracks: true } }, stockPolicy: true },
      });
      return created;
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not create release" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const products = await db.product.findMany({
      where: { creatorId: user.id, type: "RELEASE" },
      include: { release: { include: { tracks: true } }, stockPolicy: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ products });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
