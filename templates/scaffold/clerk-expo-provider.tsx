import { ClerkProvider } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

export function CaptainAuthProvider({ children }: PropsWithChildren) {
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text>Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env.local, then restart Expo.</Text>
      </View>
    );
  }
  return <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>{children}</ClerkProvider>;
}
