import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name}: ${site.tagline}`, template: `%s | ${site.name}` },
  description:
    "Practical guides, price calculators and honest software reviews for people starting a pressure washing or window cleaning business.",
  openGraph: { siteName: site.name, type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="wrap wide">
            <Link href="/" className="logo">
              🧽 {site.name}
            </Link>
            <nav>
              <Link href="/guides">Guides</Link>
              <Link href="/tools/pressure-washing-price-calculator">Price calculator</Link>
              <Link href="/about">About</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site">
          <div className="wrap wide">
            <p>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/editorial-policy">Editorial policy</Link>
              <Link href="/disclosure">Affiliate disclosure</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </p>
            <p>
              © {year} {site.name}. Some links on this site are affiliate links; we may earn a
              commission at no extra cost to you.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
