import type { Metadata } from "next";
import Link from "next/link";
import { getAllGuides } from "@/lib/content";

export const metadata: Metadata = {
  title: "Guides",
  description: "Guides to starting and running a pressure washing or window cleaning business.",
};

export default function Guides() {
  const guides = getAllGuides();
  return (
    <div className="wrap">
      <h1>Guides</h1>
      {guides.map((g) => (
        <article key={g.slug} style={{ marginBottom: 24 }}>
          <h2 style={{ marginTop: 16 }}>
            <Link href={`/guides/${g.slug}`}>{g.title}</Link>
          </h2>
          <p className="small">
            Updated {g.updated} · {g.description}
          </p>
        </article>
      ))}
    </div>
  );
}
