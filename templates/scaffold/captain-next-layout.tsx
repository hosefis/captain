import type { Metadata } from "next";
import { AuthenticationProvider } from "@/integrations/auth/authentication-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "{name}",
};

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
