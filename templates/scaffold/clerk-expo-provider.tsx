import { ClerkProvider } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import type { PropsWithChildren } from "react";

const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

export function CaptainAuthProvider({ children }: PropsWithChildren) {
  return <ClerkProvider tokenCache={tokenCache}>{children}</ClerkProvider>;
}
