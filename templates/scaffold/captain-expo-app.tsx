import { Stack } from "expo-router";
import { AuthenticationProvider } from "@/integrations/auth/authentication-provider";
import "../global.css";

export default function RootLayout() {
  return (
    <AuthenticationProvider>
      <Stack />
    </AuthenticationProvider>
  );
}
