"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { PropsWithChildren } from "react";

export function CaptainAuthProvider({ children }: PropsWithChildren) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return children;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
  );
}
