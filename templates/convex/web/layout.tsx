import type { Metadata } from "next";
import { ConvexProvider } from "@/integrations/convex/convex-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "{name}",
};

/** Provide the application stack around routed content. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="{defaultLocale}">
      <body><ConvexProvider>{children}</ConvexProvider></body>
    </html>
  );
}
