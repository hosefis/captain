import type { CheckoutContext, CheckoutResult, PaymentCheckoutAdapter } from "{corePackage}";
import { createRestBackendClient } from "{adapterExpoPackage}";

export const customApiPaymentExpoConfig = {
  processor: "custom-api" as const,
  orchestration: "{orchestration}" as const,
};

export function createCustomApiPaymentExpoAdapter(
  getToken?: () => Promise<string | null>,
): PaymentCheckoutAdapter {
  const client = createRestBackendClient(getToken);

  return {
    async initiateCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
      const response = await client.request<{
        checkout_url?: string;
        payment_initialized?: boolean;
        payment_ref?: string;
        receipt_id?: string;
      }>("POST", "/payments/checkout", {
        body: {
          productId: ctx.productId,
          amount: ctx.amount,
          currency: ctx.currency,
          customer: ctx.customer,
          returnPath: ctx.returnPath,
          metadata: ctx.metadata,
        },
      });

      if (response.checkout_url) {
        return { kind: "hosted", openInBrowser: true };
      }

      if (response.payment_initialized && response.payment_ref) {
        return {
          kind: "pending",
          paymentRef: response.payment_ref,
          pollPath: ctx.pendingPath ?? "/api/payments/status",
        };
      }

      if (response.receipt_id) {
        return { kind: "success", receiptId: response.receipt_id };
      }

      throw new Error("Custom API payment returned an unexpected response");
    },
  };
}
