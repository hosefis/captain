"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { PropsWithChildren } from "react";

/** Provides Clerk authentication to the application. */
export function AuthenticationProvider({ children }: PropsWithChildren) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return children;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
  );
}
