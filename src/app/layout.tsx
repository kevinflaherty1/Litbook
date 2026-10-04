import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import { NonceProvider } from "@/components/shared/nonce-provider";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: "Litbook: guest onboarding for podcasters", template: "%s · Litbook" },
  description:
    "Send every guest one secure link. Get back their bio, headshot, social links and a signed release, without the email chase.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by src/proxy.ts alongside the Content-Security-Policy header.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <NonceProvider nonce={nonce}>
          {children}
          <Toaster richColors position="bottom-right" />
        </NonceProvider>
      </body>
    </html>
  );
}
