import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError } from "@/lib/auth/session";
import { MessageError } from "@/lib/messages";

// Shared request parsing + error mapping for the /api/messages routes.

export const outgoingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TEXT"), body: z.string().min(1).max(2000) }),
  z.object({ kind: z.literal("IMAGE"), imageUrl: z.string().url(), body: z.string().max(2000).optional() }),
  z.object({
    kind: z.literal("SHARE"),
    share: z.object({ type: z.enum(["PRODUCT", "EVENT", "LIVE"]), id: z.string().min(1) }),
    body: z.string().max(2000).optional(),
  }),
]);

export function messageErrorResponse(err: unknown) {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof MessageError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
