import { useCallback, useEffect, useRef, useState } from "react";

export type PendingPaymentStatus = "polling" | "success" | "failed" | "timeout";

export type UsePendingPaymentOptions = {
  paymentRef: string;
  pollPath: string;
  intervalMs?: number;
  maxAttempts?: number;
  fetchStatus?: (paymentRef: string, pollPath: string) => Promise<"pending" | "paid" | "failed">;
};

export function usePendingPayment({
  paymentRef,
  pollPath,
  intervalMs = 3000,
  maxAttempts = 40,
  fetchStatus,
}: UsePendingPaymentOptions): {
  status: PendingPaymentStatus;
  retry: () => void;
} {
  const [status, setStatus] = useState<PendingPaymentStatus>("polling");
  const attemptsRef = useRef(0);
  const activeRef = useRef(true);

  const poll = useCallback(async () => {
    attemptsRef.current = 0;
    setStatus("polling");
    activeRef.current = true;

    const check = fetchStatus ?? defaultFetchStatus;

    while (activeRef.current && attemptsRef.current < maxAttempts) {
      attemptsRef.current += 1;
      const result = await check(paymentRef, pollPath);

      if (result === "paid") {
        setStatus("success");
        return;
      }

      if (result === "failed") {
        setStatus("failed");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (activeRef.current) {
      setStatus("timeout");
    }
  }, [fetchStatus, intervalMs, maxAttempts, paymentRef, pollPath]);

  useEffect(() => {
    void poll();
    return () => {
      activeRef.current = false;
    };
  }, [poll]);

  return { status, retry: () => void poll() };
}

async function defaultFetchStatus(
  paymentRef: string,
  pollPath: string,
): Promise<"pending" | "paid" | "failed"> {
  const url = `${pollPath}?paymentRef=${encodeURIComponent(paymentRef)}`;
  const response = await fetch(url);

  if (!response.ok) {
    return "failed";
  }

  const body = (await response.json()) as { status?: string };
  if (body.status === "paid" || body.status === "success") {
    return "paid";
  }
  if (body.status === "failed") {
    return "failed";
  }
  return "pending";
}
