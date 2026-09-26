import { Stack } from "expo-router";
import { CaptainConvexProvider } from "@/integrations/convex/captain-convex-provider";
import "../global.css";

export default function RootLayout() {
  return <CaptainConvexProvider><Stack /></CaptainConvexProvider>;
}
