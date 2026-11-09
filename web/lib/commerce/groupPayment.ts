import { db } from "@/lib/db";

// Cart checkout (v2, 2026-11-09): an order paid as part of a cart has no
// Payment of its own — its charge is the cart's Payment (shared
// checkoutGroupId), and its own amount is Order.amountKobo. Anything that
// refunds or reports a single order goes through here so both kinds work.

type OrderLike = {
  checkoutGroupId: string | null;
  amountKobo: number | null;
  payment: { processor: string; providerTransactionId: string | null; amountKobo: number } | null;
};

export type OrderCharge = { processor: string; providerTransactionId: string | null; amountKobo: number };

/** The processor charge behind one order, with that order's own amount. Null for a free (₦0) order. */
export async function chargeForOrder(order: OrderLike): Promise<OrderCharge | null> {
  if (order.payment) return order.payment;
  if (!order.checkoutGroupId) return null;
  const group = await db.payment.findUnique({
    where: { checkoutGroupId: order.checkoutGroupId },
    select: { processor: true, providerTransactionId: true },
  });
  if (!group) return null;
  return { processor: group.processor, providerTransactionId: group.providerTransactionId, amountKobo: order.amountKobo ?? 0 };
}

/** What a buyer paid for one order (cart share or own payment). */
export function orderAmountKobo(order: { amountKobo: number | null; payment: { amountKobo: number } | null }): number | null {
  return order.amountKobo ?? order.payment?.amountKobo ?? null;
}
