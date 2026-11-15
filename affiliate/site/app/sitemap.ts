import type { MetadataRoute } from "next";
import { getAllGuides } from "@/lib/content";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/guides", "/tools/pressure-washing-price-calculator", "/about", "/contact", "/editorial-policy", "/disclosure", "/privacy", "/terms"];
  return [
    ...pages.map((p) => ({ url: `${site.url}${p}` })),
    ...getAllGuides().map((g) => ({ url: `${site.url}/guides/${g.slug}`, lastModified: g.updated })),
  ];
}
