import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Editorial Policy",
  description: `How ${site.name} researches, writes and updates its guides.`,
};

export default function EditorialPolicy() {
  return (
    <div className="wrap prose">
      <h1>Editorial Policy</h1>
      <h2>How we research</h2>
      <ul>
        <li>Prices, costs and rules come from published sources, which we link in each article.</li>
        <li>When sources disagree, we show the range instead of picking the most convenient number.</li>
        <li>Licensing, tax and insurance topics point to official sources. Always confirm locally.</li>
      </ul>
      <h2>How we review products and software</h2>
      <ul>
        <li>
          Software reviews are based on actually signing up and using the product. We include our
          own screenshots.
        </li>
        <li>
          If we haven&apos;t used a product, the article says so and labels the information as
          research-based (from the vendor&apos;s site, documentation or public reviews).
        </li>
        <li>We never invent test results, quotes, testimonials or ratings.</li>
      </ul>
      <h2>How we use AI</h2>
      <p>
        We use AI writing tools to help research and draft articles. Every article is reviewed,
        fact-checked against its sources and edited by a person before it&apos;s published, and a
        person is responsible for what we publish.
      </p>
      <h2>Updates and corrections</h2>
      <p>
        Each guide shows when it was last updated. We review pricing guides at least once a year.
        Found an error? <Link href="/contact">Tell us</Link> and we&apos;ll fix it.
      </p>
      <h2>Money</h2>
      <p>
        We earn from some links. See our <Link href="/disclosure">affiliate disclosure</Link>.
        Commissions never decide our recommendations.
      </p>
    </div>
  );
}
