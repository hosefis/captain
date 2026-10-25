import { Stack } from "expo-router";
import { ConvexProvider } from "@/integrations/convex/convex-provider";
import "../global.css";

/** Provide the application stack around routed content. */
export default function RootLayout() {
  return <ConvexProvider><Stack /></ConvexProvider>;
}
