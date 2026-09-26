"use client";

import type { PropsWithChildren } from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convex = deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;

function Connected({ children }: PropsWithChildren) {
  return <ConvexProviderWithClerk client={convex!} useAuth={useAuth}>{children}</ConvexProviderWithClerk>;
}

export function CaptainConvexProvider({ children }: PropsWithChildren) {
  if (!convex || !publishableKey) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Connect Convex and Clerk to continue</h1>
        <p>Run <code>npx convex dev</code>, set <code>NEXT_PUBLIC_CONVEX_URL</code> and the Clerk keys in <code>.env.local</code>, then restart the app.</p>
      </main>
    );
  }
  return <ClerkProvider publishableKey={publishableKey}><Connected>{children}</Connected></ClerkProvider>;
}
