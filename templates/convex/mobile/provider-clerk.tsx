import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const deploymentUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convex = deploymentUrl ? new ConvexReactClient(deploymentUrl) : null;

function Connected({ children }: PropsWithChildren) {
  return <ConvexProviderWithClerk client={convex!} useAuth={useAuth}>{children}</ConvexProviderWithClerk>;
}

export function CaptainConvexProvider({ children }: PropsWithChildren) {
  if (!convex || !publishableKey) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "bold" }}>Connect Convex and Clerk to continue</Text>
        <Text>Run npx convex dev, set EXPO_PUBLIC_CONVEX_URL and the Clerk key in .env.local, then restart Expo.</Text>
      </View>
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <Connected>{children}</Connected>
    </ClerkProvider>
  );
}
