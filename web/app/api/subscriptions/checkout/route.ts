import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { startSubscriptionCheckout, SubscriptionUnavailableError } from "@/lib/subscriptions/payments";

// Subscribe to (or renew) an artist's catalog: starts a processor checkout
// for one period. The subscription is created/extended by the webhook.
const bodySchema = z.object({
  creatorId: z.string().min(1).max(64),
  durationDays: z.number().int(),
  autoRenew: z.boolean().default(true),
  gateway: z.enum(["flutterwave", "monnify", "bachs"]).default("bachs"),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const body = bodySchema.parse(await req.json());
    const { checkoutUrl, paymentRef } = await startSubscriptionCheckout({
      subscriber: { id: user.id, email: user.email, displayName: user.displayName },
      creatorId: body.creatorId,
      durationDays: body.durationDays,
      autoRenew: body.autoRenew,
      gateway: body.gateway,
      origin: req.nextUrl.origin,
    });
    return NextResponse.json({ checkoutUrl, ref: paymentRef });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof SubscriptionUnavailableError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
