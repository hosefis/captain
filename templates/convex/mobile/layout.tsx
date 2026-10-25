import { Stack } from "expo-router";
import { ConvexProvider } from "@/integrations/convex/convex-provider";
import "../global.css";

/** Wraps application routes with the selected providers and root layout. */
export default function RootLayout() {
  return <ConvexProvider><Stack /></ConvexProvider>;
}
