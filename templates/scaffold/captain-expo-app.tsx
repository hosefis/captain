import { Stack } from "expo-router";
import { CaptainAuthProvider } from "@/integrations/auth/captain-auth-provider";
import "../global.css";

export default function RootLayout() {
  return (
    <CaptainAuthProvider>
      <Stack />
    </CaptainAuthProvider>
  );
}
