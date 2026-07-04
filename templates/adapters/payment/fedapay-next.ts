import type { CheckoutContext, CheckoutResult, PaymentCheckoutAdapter } from "{corePackage}";

export const fedapayPaymentConfig = {
  processor: "fedapay" as const,
  orchestration: "{orchestration}" as const,
};

export function createFedapayPaymentAdapter(): PaymentCheckoutAdapter {
  return {
    async initiateCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
      const response = await fetch("/api/payments/fedapay/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: ctx.amount,
          currency: ctx.currency,
          customer: ctx.customer,
          returnPath: ctx.returnPath,
          metadata: ctx.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error("FedaPay initiation failed");
      }

      const body = (await response.json()) as {
        url?: string;
        payment_ref?: string;
        receipt_id?: string;
      };

      if (body.url) {
        return { kind: "redirect", url: body.url };
      }

      if (body.payment_ref) {
        return {
          kind: "pending",
          paymentRef: body.payment_ref,
          pollPath: ctx.pendingPath ?? "/api/payments/fedapay/status",
        };
      }

      if (body.receipt_id) {
        return { kind: "success", receiptId: body.receipt_id };
      }

      throw new Error("FedaPay returned an unexpected response");
    },
  };
}
