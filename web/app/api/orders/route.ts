import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reserveStock, confirmStock, releaseReservation } from "@/lib/commerce/stock";
import { initializePayment as initializeFlutterwavePayment } from "@/lib/flutterwave";
import { initializePayment as initializeMonnifyPayment } from "@/lib/monnify";
import { initializePayment as initializeBachsPayment } from "@/lib/bachs";
import { GIFTABLE_TYPES, giftExpiresAt } from "@/lib/commerce/gifts";
import { buildTicketInfo } from "@/lib/commerce/tickets";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { resolveGuestBuyer, sendGuestAccountSetupEmail } from "@/lib/commerce/guestCheckout";
import { adminAuth } from "@/lib/firebase/admin";

const shippingSchema = z.object({
  recipientName: z.string().min(1).max(120),
  phone: z.string().min(1).max(30),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  country: z.string().min(1).max(60).default("Nigeria"),
});

// Collected only when there's no Firebase session at all (guest checkout —
// "do not force a customer to create an account or log in before
// purchasing"). Name/email only, matching the doc's own minimal-checkout
// requirement — no username/password/profile step.
const guestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
});

const bodySchema = z.object({
  productId: z.string().min(1),
  shipping: shippingSchema.optional(),
  isGift: z.boolean().optional(),
  guest: guestSchema.optional(),
  // Ticket/merch group buys (explicit ask). Capped at 20 per checkout — a
  // sane real-world ceiling (matches common ticketing sites' per-order
  // limits), not a stock/business rule; raise it if that turns out too low.
  quantity: z.number().int().min(1).max(20).default(1),
  // Buyer-selected checkout processor — ignored for free (₦0) orders, which
  // never reach a processor at all. Bachs is the default (and, per
  // GatewayPickerSheet.tsx, the only buyer-visible option right now):
  // Flutterwave and Monnify's merchant accounts are still pending approval,
  // so a client that hasn't been updated to send this should land on the
  // processor that's actually live.
  gateway: z.enum(["flutterwave", "monnify", "bachs"]).default("bachs"),
});

// RELEASE/BEAT stay single-copy — a digital single never had a reason to be
// bought twice by the same person. EVENT/MERCH are the ones this feature is
// actually for (explicit ask: "buy as many as possible of the tickets and
// merch").
const MULTI_UNIT_TYPES = new Set(["EVENT", "MERCH"]);

export async function POST(req: NextRequest) {
  try {
    const { productId, shipping, isGift = false, guest, quantity, gateway } = bodySchema.parse(await req.json());

    // No Firebase session at all → guest checkout: resolve (or silently
    // create) a real, passwordless account for the email given at checkout,
    // rather than a bespoke "no account" order shape — see
    // lib/commerce/guestCheckout.ts for why. A brand-new account gets a
    // Firebase custom token back in the response so the client can sign the
    // browser straight into it (components/checkout/GuestInfoSheet.tsx),
    // landing on the exact same authenticated Library/download pipeline
    // every other buyer uses.
    const optionalUser = await getOptionalUser(req);
    let buyer;
    let customToken: string | null = null;
    if (optionalUser) {
      buyer = optionalUser;
    } else {
      if (!guest) {
        return NextResponse.json({ error: "Sign in, or provide your name and email to continue as a guest" }, { status: 401 });
      }
      const { user, isNewAccount } = await resolveGuestBuyer(guest);
      buyer = user;
      if (isNewAccount) {
        customToken = await adminAuth().createCustomToken(user.firebaseUid);
        void sendGuestAccountSetupEmail(user);
      }
    }

    // Sellable types are added here as each one's purchase flow ships
    // (Beat/Merch now; Event has its own tier-as-Product purchase path).
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { release: true, beat: true, merchItem: true, ticketTier: true },
    });
    const hasSubtype =
      product?.type === "RELEASE"
        ? Boolean(product.release)
        : product?.type === "BEAT"
          ? Boolean(product.beat)
          : product?.type === "MERCH"
            ? Boolean(product.merchItem)
            : product?.type === "EVENT"
              ? Boolean(product.ticketTier)
              : false;
    if (!product || product.status !== "PUBLISHED" || !hasSubtype) {
      return NextResponse.json({ error: "Not available" }, { status: 404 });
    }
    if (product.creatorId === buyer.id) {
      return NextResponse.json({ error: "You can't buy your own listing" }, { status: 400 });
    }
    if (isGift && !GIFTABLE_TYPES.includes(product.type as (typeof GIFTABLE_TYPES)[number])) {
      return NextResponse.json({ error: "This can't be gifted" }, { status: 400 });
    }
    if (quantity > 1) {
      if (!MULTI_UNIT_TYPES.has(product.type)) {
        return NextResponse.json({ error: "Only one of this can be purchased" }, { status: 400 });
      }
      // A gift is for one specific claimant — "buy 5, gift all 5 to one
      // person" isn't a real scenario this needs to support.
      if (isGift) {
        return NextResponse.json({ error: "A gift can only be for one item" }, { status: 400 });
      }
    }
    // Creator-shipped fulfilment (DECISIONS.md): the platform only collects
    // the address here, at checkout time — it's stored on the Order
    // immediately (not deferred to the payment webhook) the same way
    // OrderItem already is, since it doesn't depend on payment succeeding.
    if (product.type === "MERCH" && !shipping) {
      return NextResponse.json({ error: "Shipping address is required" }, { status: 400 });
    }

    // Shipping fee is a flat per-order cost (explicit ask), not multiplied by
    // quantity — "one package, one shipping cost" for items shipped together.
    // Snapshotted onto MerchOrderFulfillment so a later fee edit never
    // changes what a past buyer paid (same pattern as OrderItem.priceKobo).
    const shippingFeeKobo = product.type === "MERCH" ? (product.merchItem?.shippingFeeKobo ?? 0) : 0;
    const amountKobo = product.priceKobo * quantity + shippingFeeKobo;

    // Repeat/multi-unit purchases are the whole point for EVENT/MERCH — this
    // guard now only protects RELEASE/BEAT, which never had a reason to be
    // bought twice by the same person.
    if (!isGift && !MULTI_UNIT_TYPES.has(product.type)) {
      const existing = await db.entitlement.findFirst({
        where: { userId: buyer.id, productId },
      });
      if (existing && !existing.revokedAt) {
        return NextResponse.json({ error: "You already own this" }, { status: 409 });
      }
    }

    const reservation = await reserveStock(productId, quantity);
    if (!reservation.ok) {
      return NextResponse.json({ error: "Sold out" }, { status: 409 });
    }

    // Free releases are a sale at ₦0 (PRD §7.1/§8): no payment processor
    // involved, entitlement granted immediately, still counted as a unit sold.
    // A free Merch listing with a nonzero shipping fee is NOT a ₦0 order —
    // it still owes the fee, so it falls through to the paid path below.
    if (amountKobo === 0) {
      try {
        const checkInCodes: string[] = [];
        const order = await db.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              buyerId: buyer.id,
              status: "PAID",
              isGift,
              items: { create: { productId, priceKobo: 0, quantity } },
              merchFulfillment: shipping ? { create: { ...shipping, shippingFeeKobo } } : undefined,
            },
          });
          if (isGift) {
            await tx.gift.create({
              data: { productId, giverId: buyer.id, orderId: created.id, expiresAt: giftExpiresAt() },
            });
          } else {
            for (let i = 0; i < quantity; i++) {
              const entitlement = await tx.entitlement.create({ data: { userId: buyer.id, productId, orderId: created.id } });
              if (product.type === "EVENT") {
                const checkIn = await tx.ticketCheckIn.create({ data: { entitlementId: entitlement.id } });
                checkInCodes.push(checkIn.code);
              }
            }
          }
          await confirmStock(productId, quantity, tx);
          return created;
        });

        if (!isGift) {
          void sendOrderConfirmationEmail({
            to: buyer.email,
            buyerName: buyer.displayName,
            orderId: order.id,
            productTitle: product.title,
            priceKobo: 0,
            tickets: (await Promise.all(checkInCodes.map((code) => buildTicketInfo(productId, code)))).filter((t) => t !== null),
            productType: product.type,
          }).catch((err) => console.error("order confirmation email failed", err));
        }

        return NextResponse.json({ free: true, orderId: order.id, customToken }, { status: 201 });
      } catch (err) {
        await releaseReservation(productId, quantity);
        throw err;
      }
    }

    try {
      const order = await db.order.create({
        data: {
          buyerId: buyer.id,
          status: "PENDING",
          isGift,
          items: { create: { productId, priceKobo: product.priceKobo, quantity } },
          merchFulfillment: shipping ? { create: { ...shipping, shippingFeeKobo } } : undefined,
        },
      });
      await db.payment.create({
        data: { orderId: order.id, processor: gateway, processorRef: order.id, amountKobo, status: "INITIATED" },
      });

      const checkoutUrl =
        gateway === "monnify"
          ? await initializeMonnifyPayment({
              txRef: order.id,
              amountKobo,
              customerEmail: buyer.email,
              customerName: buyer.displayName,
              redirectUrl: `${req.nextUrl.origin}/checkout/callback`,
              title: product.title,
            })
          : gateway === "bachs"
            ? await initializeBachsPayment({
                txRef: order.id,
                amountKobo,
                customerEmail: buyer.email,
                customerName: buyer.displayName,
                redirectUrl: `${req.nextUrl.origin}/checkout/callback`,
                title: product.title,
              })
            : await initializeFlutterwavePayment({
                txRef: order.id,
                amountKobo,
                customerEmail: buyer.email,
                redirectUrl: `${req.nextUrl.origin}/checkout/callback`,
                title: product.title,
              });

      return NextResponse.json({ orderId: order.id, checkoutUrl, customToken }, { status: 201 });
    } catch (err) {
      await releaseReservation(productId, quantity);
      console.error(err);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
