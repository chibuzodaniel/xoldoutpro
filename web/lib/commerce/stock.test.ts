import { randomUUID } from "crypto";
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { reserveStock, confirmStock, releaseReservation } from "./stock";

// Integration test against the real local Postgres (see `npx prisma dev` /
// DATABASE_URL) — this is the hardest correctness problem in the PRD
// (§16): two buyers racing for the last copy must never both succeed.
// Written before wiring checkout/webhook to it, per the PRD's own instruction.

async function makeCappedProduct(cap: number | null) {
  const creator = await db.user.create({
    data: {
      firebaseUid: randomUUID(),
      email: `${randomUUID()}@test.local`,
      handle: randomUUID().slice(0, 12),
      displayName: "Race Test Creator",
    },
  });
  const product = await db.product.create({
    data: {
      creatorId: creator.id,
      type: "RELEASE",
      title: "Race Test Release",
      description: "",
      priceKobo: 100,
      status: "PUBLISHED",
      stockPolicy: { create: { cap } },
    },
  });
  return product.id;
}

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
});
