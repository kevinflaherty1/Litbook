import path from "node:path";
import type { NextConfig } from "next";
import { links } from "./data/links";

const nextConfig: NextConfig = {
  // This site lives inside another Next.js repo; keep it self-contained.
  turbopack: { root: path.join(__dirname) },
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    // Temporary (307) so links can be swapped any time without browsers caching them.
    return links.map((l) => ({
      source: `/go/${l.slug}`,
      destination: l.url,
      permanent: false,
    }));
  },
};

export default nextConfig;
