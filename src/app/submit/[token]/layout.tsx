import type { Metadata } from "next";

import Link from "next/link";

export const metadata: Metadata = {
  title: "Guest details",
  // The URL is a credential: keep it out of search engines and Referer headers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PortalLayout({ children }: LayoutProps<"/submit/[token]">) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
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
