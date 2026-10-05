import type { Metadata } from "next";

import Link from "next/link";

import { getOnboardingContext } from "@/features/portal/queries";
import { brandStyle } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Guest details",
  // The URL is a credential: keep it out of search engines and Referer headers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PortalLayout({ children, params }: LayoutProps<"/submit/[token]">) {
  const { token } = await params;
  // Cached per request, so the page's own lookup doesn't hit the database again.
  const ctx = await getOnboardingContext(token);
  return (
    <div className="flex min-h-svh flex-col bg-muted/30" style={brandStyle(ctx?.organization.brand_color)}>
      <main className="mx-auto grid w-full max-w-2xl flex-1 grid-cols-1 content-start gap-6 px-4 py-8 sm:py-12">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <Link href="/" className="font-medium underline-offset-4 hover:underline">
          Litbook
        </Link>
      </footer>
    </div>
  );
}
