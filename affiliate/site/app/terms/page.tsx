import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Use", description: `Terms of use for ${site.name}.` };

export default function Terms() {
  return (
    <div className="wrap prose">
      <h1>Terms of Use</h1>
      <p className="small">Last updated: 2026-11-15</p>
      <p>By using {site.domain} you agree to these terms.</p>
      <h2>Information only</h2>
      <p>
        Our content is general information, not legal, tax, insurance or financial advice. Prices
        and estimates (including calculator results) are starting points that vary by location and
        job. Confirm licensing, insurance and tax requirements with your state, city and licensed
        professionals before acting.
      </p>
      <h2>Safety</h2>
      <p>
        Pressure washing equipment, ladders and chemicals can cause injury and property damage.
        Follow manufacturer instructions and safety practices. You are responsible for how you use
        any information from this site.
      </p>
      <h2>Third-party sites</h2>
      <p>
        We link to other websites, including affiliate partners. We don&apos;t control them and
        aren&apos;t responsible for their content, products or policies.
      </p>
      <h2>No warranty; limitation of liability</h2>
      <p>
        The site is provided &quot;as is&quot; without warranties. To the extent the law allows, {site.name}{" "}
        is not liable for any loss arising from your use of the site.
      </p>
      <h2>Content</h2>
      <p>You may share links to our pages. Please don&apos;t republish our articles without permission.</p>
      <h2>Contact</h2>
      <p>
        <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
    </div>
  );
}
