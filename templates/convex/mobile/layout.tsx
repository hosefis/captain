import { Stack } from "expo-router";
import { ConvexProvider } from "@/integrations/convex/convex-provider";
import "../global.css";

export default function RootLayout() {
  return <ConvexProvider><Stack /></ConvexProvider>;
}
