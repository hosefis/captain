import { Stack } from "expo-router";
import { AuthenticationProvider } from "@/integrations/auth/authentication-provider";
import "../global.css";

/** Provide application integration context around routed content. */
export default function RootLayout() {
  return (
    <AuthenticationProvider>
      <Stack />
    </AuthenticationProvider>
  );
}
