import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "About", description: `About ${site.name} and ${site.author}.` };

export default function About() {
  return (
    <div className="wrap prose">
      <h1>About {site.name}</h1>
      <p>
        Hi, I&apos;m {site.author}. {site.name} is a resource for people who want to start a small
        exterior cleaning business, mainly pressure washing and window cleaning, without
        wasting money on the wrong equipment, underpricing their work, or paying for software
        they don&apos;t need yet.
      </p>
      <h2>What you can expect here</h2>
      <ul>
        <li>
          <strong>Sourced numbers.</strong> Prices, costs and rules come from published sources
          we link to, so you can check them yourself.
        </li>
        <li>
          <strong>Hands-on software reviews.</strong> When we review business software, we sign
          up and use it ourselves, with screenshots. If we haven&apos;t used something, we say so.
        </li>
        <li>
          <strong>Free tools.</strong> Calculators and templates you can use without signing up
          for anything.
        </li>
      </ul>
      <h2>What we&apos;re not</h2>
      <p>
        We&apos;re not lawyers, accountants or insurance agents. For licensing, taxes and coverage,
        we point you to official sources, and you should confirm with your state, city and a
        licensed professional.
      </p>
      <p>
        {site.author} is a pen name. Read our <Link href="/editorial-policy">editorial policy</Link>{" "}
        to see how articles are researched and written, and our{" "}
        <Link href="/disclosure">affiliate disclosure</Link> to see how the site makes money.
      </p>
      <p>
        Questions or corrections? <Link href="/contact">Get in touch</Link>.
      </p>
    </div>
  );
}
