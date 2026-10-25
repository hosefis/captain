import type { Metadata } from "next";
import { AuthenticationProvider } from "@/integrations/auth/authentication-provider";
import "./globals.css";

/** Project title exposed through Next.js page metadata. */
export const metadata: Metadata = {
  title: "{name}",
};

/** Wraps application routes with the selected providers and root layout. */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="{defaultLocale}">
      <body>
        <AuthenticationProvider>{children}</AuthenticationProvider>
      </body>
    </html>
  );
}
