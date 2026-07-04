import type { CheckoutContext, CheckoutResult, PaymentCheckoutAdapter } from "./types.js";

export type { CheckoutContext, CheckoutResult, PaymentCheckoutAdapter } from "./types.js";

export async function initiateCheckout(
  adapter: PaymentCheckoutAdapter,
  ctx: CheckoutContext,
): Promise<CheckoutResult> {
  return adapter.initiateCheckout(ctx);
}
