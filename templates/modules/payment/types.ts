export type CheckoutCustomer = {
  email: string;
  userId: string;
};

export type CheckoutContext = {
  productId?: string;
  amount?: number;
  currency: string;
  customer: CheckoutCustomer;
  returnPath: string;
  pendingPath?: string;
  metadata?: Record<string, unknown>;
};

export type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "pending"; paymentRef: string; pollPath?: string }
  | { kind: "success"; receiptId: string }
  | { kind: "hosted"; openInBrowser: true };

export type PaymentCheckoutAdapter = {
  initiateCheckout(ctx: CheckoutContext): Promise<CheckoutResult>;
};
