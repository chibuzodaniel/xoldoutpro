import { randomUUID } from "crypto";
import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { reserveStock, confirmStock, releaseReservation } from "./stock";

// Integration test against the real local Postgres (see `npx prisma dev` /
// DATABASE_URL) — this is the hardest correctness problem in the PRD
// (§16): two buyers racing for the last copy must never both succeed.
// Written before wiring checkout/webhook to it, per the PRD's own instruction.
//
// This runs against the same database the dev server uses, so it has to
// clean up after itself — an earlier version of this file didn't, and left
// PUBLISHED "Race Test Release" rows with no backing Release record sitting
// in the real Home feed. Status is DRAFT (never surfaced on Home/browse
// regardless) as a second line of defense, and every created row is tracked
// and deleted in afterEach.

const createdProductIds: string[] = [];
const createdUserIds: string[] = [];

async function makeCappedProduct(cap: number | null) {
  const creator = await db.user.create({
    data: {
      firebaseUid: randomUUID(),
      email: `${randomUUID()}@test.local`,
      handle: randomUUID().slice(0, 12),
      displayName: "Race Test Creator",
    },
  });
  createdUserIds.push(creator.id);

  const product = await db.product.create({
    data: {
      creatorId: creator.id,
      type: "RELEASE",
      title: "Race Test Release",
      description: "",
      priceKobo: 100,
      status: "DRAFT",
      stockPolicy: { create: { cap } },
    },
  });
  createdProductIds.push(product.id);

  return product.id;
}

afterEach(async () => {
  await db.stockPolicy.deleteMany({ where: { productId: { in: createdProductIds } } });
  await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
  createdProductIds.length = 0;
  createdUserIds.length = 0;
});

describe("stock reservation race", () => {
  it("never lets more concurrent reservations succeed than the cap allows", async () => {
    const productId = await makeCappedProduct(1);

    const attempts = 10;
    const results = await Promise.all(Array.from({ length: attempts }, () => reserveStock(productId)));
    const successes = results.filter((r) => r.ok);

    expect(successes.length).toBe(1);

    const policy = await db.stockPolicy.findUniqueOrThrow({ where: { productId } });
    expect(policy.reserved).toBe(1);
    expect(policy.sold).toBe(0);
  });

  it("respects a cap greater than one under concurrency", async () => {
    const productId = await makeCappedProduct(5);

    const results = await Promise.all(Array.from({ length: 12 }, () => reserveStock(productId)));
    const successes = results.filter((r) => r.ok);

    expect(successes.length).toBe(5);
  });

  it("confirmStock moves reserved -> sold and sets soldOutAt exactly at cap", async () => {
    const productId = await makeCappedProduct(1);
    const reserved = await reserveStock(productId);
    expect(reserved.ok).toBe(true);

    await confirmStock(productId);
    const policy = await db.stockPolicy.findUniqueOrThrow({ where: { productId } });
    expect(policy.sold).toBe(1);
    expect(policy.reserved).toBe(0);
    expect(policy.soldOutAt).not.toBeNull();

    const next = await reserveStock(productId);
    expect(next.ok).toBe(false);
  });

  it("releaseReservation returns a held unit to the pool", async () => {
    const productId = await makeCappedProduct(1);
    await reserveStock(productId);
    await releaseReservation(productId);

    const policy = await db.stockPolicy.findUniqueOrThrow({ where: { productId } });
    expect(policy.reserved).toBe(0);

    const retry = await reserveStock(productId);
    expect(retry.ok).toBe(true);
  });

  it("never blocks on an uncapped product", async () => {
    const productId = await makeCappedProduct(null);
    const results = await Promise.all(Array.from({ length: 10 }, () => reserveStock(productId)));
    expect(results.every((r) => r.ok)).toBe(true);
  });

  // Ticket/merch group buys (quantity > 1) — the WHERE clause checks the
  // *whole* requested quantity fits under cap in one atomic UPDATE, so this
  // has to be all-or-nothing, never a partial reservation.
  it("reserves a whole quantity at once when it fits under cap", async () => {
    const productId = await makeCappedProduct(5);
    const result = await reserveStock(productId, 3);
    expect(result.ok).toBe(true);

    const policy = await db.stockPolicy.findUniqueOrThrow({ where: { productId } });
    expect(policy.reserved).toBe(3);
  });

  it("rejects a quantity that doesn't fully fit, reserving none of it", async () => {
    const productId = await makeCappedProduct(2);
    const result = await reserveStock(productId, 3);
    expect(result.ok).toBe(false);

    const policy = await db.stockPolicy.findUniqueOrThrow({ where: { productId } });
    expect(policy.reserved).toBe(0);
  });

  it("confirmStock/releaseReservation move and return the full quantity", async () => {
    const productId = await makeCappedProduct(5);
    await reserveStock(productId, 3);

    await confirmStock(productId, 2);
    let policy = await db.stockPolicy.findUniqueOrThrow({ where: { productId } });
    expect(policy.sold).toBe(2);
    expect(policy.reserved).toBe(1);

    await releaseReservation(productId, 1);
    policy = await db.stockPolicy.findUniqueOrThrow({ where: { productId } });
    expect(policy.reserved).toBe(0);
  });
});
