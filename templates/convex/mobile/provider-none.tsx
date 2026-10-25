import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { ConvexProvider as ConvexClientProvider, ConvexReactClient } from "convex/react";

const deploymentUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;

/** Connects the application to its Convex deployment. */
export function ConvexProvider({ children }: PropsWithChildren) {
  if (!convex) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "bold" }}>Connect Convex to continue</Text>
        <Text>Run npx convex dev, set EXPO_PUBLIC_CONVEX_URL in .env.local, then restart Expo.</Text>
      </View>
    );
  }
  return <ConvexClientProvider client={convex}>{children}</ConvexClientProvider>;
}
