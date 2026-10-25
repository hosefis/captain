"use client";

import type { PropsWithChildren } from "react";
import { ConvexProvider as ConvexClientProvider, ConvexReactClient } from "convex/react";

const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;

/** Connects the application to its Convex deployment. */
export function ConvexProvider({ children }: PropsWithChildren) {
  if (!convex) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Connect Convex to continue</h1>
        <p>Run <code>npx convex dev</code>, then set <code>NEXT_PUBLIC_CONVEX_URL</code> in <code>.env.local</code> and restart the app.</p>
      </main>
    );
  }
  return <ConvexClientProvider client={convex}>{children}</ConvexClientProvider>;
}
