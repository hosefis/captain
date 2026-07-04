import type { CheckoutContext, CheckoutResult, PaymentCheckoutAdapter } from "{corePackage}";

export const clerkBillingConfig = {
  processor: "clerk-billing" as const,
  orchestration: "{orchestration}" as const,
};

export function createClerkBillingAdapter(): PaymentCheckoutAdapter {
  return {
    async initiateCheckout(ctx: CheckoutContext): Promise<CheckoutResult> {
      const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${ctx.returnPath}`;

      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: ctx.productId,
          customer: ctx.customer,
          returnUrl,
          metadata: ctx.metadata,
        }),
      });

      if (!response.ok) {
        throw new Error("Clerk Billing checkout failed");
      }

      const body = (await response.json()) as { url?: string; receiptId?: string };
      if (body.url) {
        return { kind: "redirect", url: body.url };
      }
      if (body.receiptId) {
        return { kind: "success", receiptId: body.receiptId };
      }

      throw new Error("Clerk Billing returned an unexpected response");
    },
  };
}
