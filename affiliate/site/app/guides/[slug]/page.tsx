import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuide, getGuideSlugs } from "@/lib/content";
import { site } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${slug}` },
    openGraph: { type: "article", title: guide.title, description: guide.description },
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    dateModified: guide.updated,
    author: { "@type": "Person", name: site.author, url: `${site.url}/about` },
    publisher: { "@type": "Organization", name: site.name },
  };

  return (
    <article className="wrap">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <h1>{guide.title}</h1>
      <p className="meta">
        By <Link href="/about">{site.author}</Link> · Updated {guide.updated} ·{" "}
        <Link href="/editorial-policy">How we research</Link>
      </p>
      {guide.hasAffiliateLinks && (
        <p className="disclosure">
          This guide contains affiliate links. If you sign up or buy through them, we may earn a
          commission at no extra cost to you. It never changes what we recommend.{" "}
          <Link href="/disclosure">Learn more</Link>.
        </p>
      )}
      <div className="prose" dangerouslySetInnerHTML={{ __html: guide.html }} />
    </article>
  );
}
