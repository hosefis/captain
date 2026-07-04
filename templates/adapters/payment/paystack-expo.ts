import type { CheckoutContext, CheckoutResult, PaymentCheckoutAdapter } from "{corePackage}";

export const paystackPaymentExpoConfig = {
  processor: "paystack" as const,
  orchestration: "{orchestration}" as const,
};

export function createPaystackPaymentExpoAdapter(): PaymentCheckoutAdapter {
  return {
    async initiateCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? ""}/api/payments/paystack/initiate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: ctx.amount,
            currency: ctx.currency,
            customer: ctx.customer,
            returnPath: ctx.returnPath,
            metadata: ctx.metadata,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Paystack initiation failed");
      }

      const body = (await response.json()) as {
        authorization_url?: string;
        reference?: string;
        receipt_id?: string;
      };

      if (body.authorization_url) {
        return { kind: "hosted", openInBrowser: true };
      }

      if (body.reference) {
        return {
          kind: "pending",
          paymentRef: body.reference,
          pollPath: ctx.pendingPath ?? "/api/payments/paystack/verify",
        };
      }

      if (body.receipt_id) {
        return { kind: "success", receiptId: body.receipt_id };
      }

      throw new Error("Paystack returned an unexpected response");
    },
  };
}
