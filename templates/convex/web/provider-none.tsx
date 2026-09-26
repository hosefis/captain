"use client";

import type { PropsWithChildren } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;

export function CaptainConvexProvider({ children }: PropsWithChildren) {
  if (!convex) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Connect Convex to continue</h1>
        <p>Run <code>npx convex dev</code>, then set <code>NEXT_PUBLIC_CONVEX_URL</code> in <code>.env.local</code> and restart the app.</p>
      </main>
    );
  }
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
