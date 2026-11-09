import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reserveStock, releaseReservation } from "@/lib/commerce/stock";
import { reserveVariant, releaseVariant, variantLabel } from "@/lib/commerce/variants";
import { computeCreatorPlanCheckout } from "@/lib/commerce/creatorPlans";
import { startProcessorCheckout } from "@/lib/commerce/processorCheckout";
import { PAY_WHAT_YOU_WANT_MIN_KOBO, MAX_TIP_KOBO } from "@/lib/commerce/constants";

// Cart checkout (v2, design/v2-prototype, 2026-11-09): music, beats and merch
// from any artists, paid with ONE processor payment. Each item still becomes
// its own Order (so stock, ledger, splits, emails, refunds and the Library
// all keep working per order); they share a checkoutGroupId with the single
// Payment, and each order's share is Order.amountKobo
// (lib/commerce/confirmPayment.ts finalizeGroupPayment). Same per-item rules
// as single-item Buy (app/api/orders). Signed-in buyers only.

const shippingSchema = z.object({
  recipientName: z.string().min(1).max(120),
  phone: z.string().min(1).max(30),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  country: z.string().min(1).max(60).default("Nigeria"),
});

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(20).default(1),
  variantId: z.string().min(1).optional(),
  licenseId: z.string().min(1).optional(),
  acceptedLicenseTerms: z.boolean().optional(),
  payAmountKobo: z.number().int().positive().optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(20),
  gateway: z.enum(["flutterwave", "monnify", "bachs"]).default("bachs"),
  shipping: shippingSchema.optional(),
});

class LineError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

type Line = {
  productId: string;
  title: string;
  type: string;
  quantity: number;
  unitPriceKobo: number;
  shippingFeeKobo: number;
  amountKobo: number;
  commissionOverrideKobo: number | null;
  variant: { id: string; label: string } | null;
  license: { id: string; name: string; snapshot: Prisma.InputJsonValue } | null;
};

export async function POST(req: NextRequest) {
  const reserved: { productId: string; quantity: number; variantId: string | null }[] = [];
  const releaseAll = async () => {
    for (const r of reserved) {
      await releaseReservation(r.productId, r.quantity);
      if (r.variantId) await releaseVariant(r.variantId, r.quantity);
    }
  };

  try {
    const { user: buyer } = await requireUser(req);
    const { items, gateway, shipping } = bodySchema.parse(await req.json());

    const ids = [...new Set(items.map((i) => i.productId))];
    const [products, owned] = await Promise.all([
      db.product.findMany({
        where: { id: { in: ids } },
        include: {
          merchItem: true,
          creator: { select: { creatorPlan: true } },
          merchVariants: { select: { id: true, size: true, color: true } },
          beatLicenses: true,
          release: { select: { productId: true } },
          beat: { select: { productId: true } },
        },
      }),
      db.entitlement.findMany({ where: { userId: buyer.id, productId: { in: ids }, revokedAt: null }, select: { productId: true } }),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    const ownedIds = new Set(owned.map((o) => o.productId));
    const seenDigital = new Set<string>();

    // 1. Validate and price every line (no side effects yet).
    const lines: Line[] = [];
    for (const item of items) {
      const p = byId.get(item.productId);
      if (!p || p.status !== "PUBLISHED") throw new LineError("Something in your cart is no longer available", 404);
      if (!["RELEASE", "BEAT", "MERCH"].includes(p.type)) throw new LineError(`"${p.title}" can't be bought from the cart`);
      if ((p.type === "RELEASE" && !p.release) || (p.type === "BEAT" && !p.beat) || (p.type === "MERCH" && !p.merchItem)) {
        throw new LineError(`"${p.title}" is no longer available`, 404);
      }
      if (p.creatorId === buyer.id) throw new LineError(`You can't buy your own "${p.title}"`);
      const digital = p.type !== "MERCH";
      if (digital) {
        if (ownedIds.has(p.id)) throw new LineError(`You already own "${p.title}"`, 409);
        if (seenDigital.has(p.id)) throw new LineError(`"${p.title}" is in your cart twice`);
        seenDigital.add(p.id);
      }
      const quantity = digital ? 1 : item.quantity;

      let unitPriceKobo = p.priceKobo;
      if (p.type === "RELEASE" && p.payWhatYouWant) {
        const floor = Math.max(p.priceKobo, PAY_WHAT_YOU_WANT_MIN_KOBO);
        unitPriceKobo = item.payAmountKobo ?? floor;
        if (unitPriceKobo < floor || unitPriceKobo > MAX_TIP_KOBO) throw new LineError(`Pick an amount of at least ₦${floor / 100} for "${p.title}"`);
      }

      let license: Line["license"] = null;
      if (p.type === "BEAT" && p.beatLicenses.length > 0) {
        const picked = p.beatLicenses.find((l) => l.id === item.licenseId);
        if (!picked) throw new LineError(`Pick a license for "${p.title}"`);
        if (item.acceptedLicenseTerms !== true) throw new LineError(`Agree to the ${picked.name} license terms for "${p.title}"`);
        unitPriceKobo = picked.priceKobo;
        license = {
          id: picked.id,
          name: picked.name,
          snapshot: { formats: picked.formats, isExclusive: picked.isExclusive, terms: picked.terms } as Prisma.InputJsonValue,
        };
      }

      let variant: Line["variant"] = null;
      if (p.type === "MERCH") {
        if (!shipping) throw new LineError("Add a shipping address for the merch in your cart");
        if (p.merchVariants.length > 0) {
          const picked = p.merchVariants.find((v) => v.id === item.variantId);
          if (!picked) throw new LineError(`Pick a size or colour for "${p.title}"`);
          variant = { id: picked.id, label: variantLabel(picked) };
        }
      }

      if (unitPriceKobo <= 0) throw new LineError(`"${p.title}" is free — get it from its page instead`);
      const shippingFeeKobo = p.type === "MERCH" ? (p.merchItem?.shippingFeeKobo ?? 0) : 0;
      const plan = await computeCreatorPlanCheckout(p.creator.creatorPlan, unitPriceKobo * quantity + shippingFeeKobo, p.type);
      lines.push({
        productId: p.id,
        title: p.title,
        type: p.type,
        quantity,
        unitPriceKobo,
        shippingFeeKobo,
        amountKobo: plan.amountKobo,
        commissionOverrideKobo: plan.commissionOverrideKobo,
        variant,
        license,
      });
    }

    // 2. Hold stock for every line; if anything is sold out, let go of all of it.
    for (const line of lines) {
      const ok = await reserveStock(line.productId, line.quantity);
      if (!ok.ok) {
        await releaseAll();
        return NextResponse.json({ error: `"${line.title}" is sold out` }, { status: 409 });
      }
      if (line.variant && !(await reserveVariant(line.variant.id, line.quantity))) {
        await releaseReservation(line.productId, line.quantity);
        await releaseAll();
        return NextResponse.json({ error: `"${line.title}" (${line.variant.label}) is sold out` }, { status: 409 });
      }
      reserved.push({ productId: line.productId, quantity: line.quantity, variantId: line.variant?.id ?? null });
    }

    // 3. One order per line + one payment, written together.
    const groupId = randomUUID();
    const totalKobo = lines.reduce((sum, l) => sum + l.amountKobo, 0);
    try {
      await db.$transaction(async (tx) => {
        for (const line of lines) {
          await tx.order.create({
            data: {
              buyerId: buyer.id,
              status: "PENDING",
              checkoutGroupId: groupId,
              amountKobo: line.amountKobo,
              commissionOverrideKobo: line.commissionOverrideKobo,
              items: {
                create: {
                  productId: line.productId,
                  priceKobo: line.unitPriceKobo,
                  quantity: line.quantity,
                  variantId: line.variant?.id,
                  variantLabel: line.variant?.label,
                  licenseId: line.license?.id,
                  licenseName: line.license?.name,
                  licenseTerms: line.license?.snapshot,
                },
              },
              merchFulfillment: line.type === "MERCH" && shipping ? { create: { ...shipping, shippingFeeKobo: line.shippingFeeKobo } } : undefined,
            },
          });
        }
        await tx.payment.create({
          data: { checkoutGroupId: groupId, processor: gateway, processorRef: groupId, amountKobo: totalKobo, status: "INITIATED" },
        });
      });
    } catch (err) {
      await releaseAll();
      throw err;
    }

    try {
      const checkoutUrl = await startProcessorCheckout({
        gateway,
        txRef: groupId,
        amountKobo: totalKobo,
        customerEmail: buyer.email,
        customerName: buyer.displayName,
        redirectUrl: `${req.nextUrl.origin}/checkout/callback`,
        title: lines.length === 1 ? lines[0].title : `${lines.length} items on XOLDOUT`,
      });
      return NextResponse.json({ groupId, checkoutUrl, totalKobo }, { status: 201 });
    } catch (err) {
      // The processor didn't open a checkout: undo the holds and close the group.
      await releaseAll();
      await db.payment.updateMany({ where: { checkoutGroupId: groupId, status: "INITIATED" }, data: { status: "FAILED" } });
      await db.order.updateMany({ where: { checkoutGroupId: groupId, status: "PENDING" }, data: { status: "FAILED" } });
      console.error(err);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
    }
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: "Sign in to check out your cart" }, { status: err.status });
    if (err instanceof LineError) {
      await releaseAll();
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Your cart has an invalid item" }, { status: 400 });
    await releaseAll();
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
