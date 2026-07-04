"use client";

import { usePendingPayment } from "./use-pending-payment.js";

export type PendingPaymentScreenProps = {
  paymentRef: string;
  pollPath: string;
  title?: string;
  pendingLabel?: string;
  successLabel?: string;
  failedLabel?: string;
  timeoutLabel?: string;
};

export function PendingPaymentScreen({
  paymentRef,
  pollPath,
  title = "Processing payment",
  pendingLabel = "Waiting for confirmation…",
  successLabel = "Payment confirmed",
  failedLabel = "Payment failed",
  timeoutLabel = "Payment timed out — check your email or try again",
}: PendingPaymentScreenProps) {
  const { status, retry } = usePendingPayment({ paymentRef, pollPath });

  const message =
    status === "polling"
      ? pendingLabel
      : status === "success"
        ? successLabel
        : status === "failed"
          ? failedLabel
          : timeoutLabel;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p>{message}</p>
      {(status === "failed" || status === "timeout") && (
        <button type="button" onClick={retry}>
          Retry
        </button>
      )}
    </main>
  );
}
