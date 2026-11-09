import { initializePayment as initializeFlutterwavePayment } from "@/lib/flutterwave";
import { initializePayment as initializeMonnifyPayment } from "@/lib/monnify";
import { initializePayment as initializeBachsPayment } from "@/lib/bachs";

export type Gateway = "flutterwave" | "monnify" | "bachs";

// One spot for every processor's checkout-page call — single-item orders
// (app/api/orders), tips and cart checkouts (app/api/checkout/cart) all end here.
export async function startProcessorCheckout(args: {
  gateway: Gateway;
  txRef: string;
  amountKobo: number;
  customerEmail: string;
  customerName: string;
  redirectUrl: string;
  title: string;
}) {
  const { gateway, ...rest } = args;
  if (gateway === "monnify") return initializeMonnifyPayment(rest);
  if (gateway === "bachs") return initializeBachsPayment(rest);
  return initializeFlutterwavePayment(rest);
}
