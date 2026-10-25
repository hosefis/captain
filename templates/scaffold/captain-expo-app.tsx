import { Stack } from "expo-router";
import { AuthenticationProvider } from "@/integrations/auth/authentication-provider";
import "../global.css";

/** Wraps application routes with the selected providers and root layout. */
export default function RootLayout() {
  return (
    <AuthenticationProvider>
      <Stack />
    </AuthenticationProvider>
  );
}
