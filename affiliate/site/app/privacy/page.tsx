import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy", description: `Privacy policy for ${site.name}.` };

// Starter policy. Review it whenever you add analytics, email signup, ads or new affiliate
// programs, and consider a policy generator or a lawyer once the site earns money.
export default function Privacy() {
  return (
    <div className="wrap prose">
      <h1>Privacy Policy</h1>
      <p className="small">Last updated: 2026-11-15</p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Emails you send us.</strong> If you email us, we keep your message and address to
          reply. We don&apos;t sell it.
        </li>
        <li>
          <strong>Basic usage data.</strong> Our hosting provider and any privacy-friendly analytics
          we use may record standard information like pages viewed, browser type and approximate
          location, to understand which content is useful.
        </li>
        <li>
          <strong>Calculator inputs</strong> stay in your browser and are not sent to us.
        </li>
      </ul>
      <h2>Affiliate links and cookies</h2>
      <p>
        When you click an affiliate link, the company you visit (or its affiliate network) may set
        cookies to track that you came from {site.name}, so we can be credited for a sale or
        signup. Those companies&apos; own privacy policies apply on their sites.
      </p>
      <h2>Your choices</h2>
      <p>
        You can block or delete cookies in your browser settings. To ask about or delete
        information you&apos;ve sent us, email <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
      <h2>Children</h2>
      <p>This site is intended for adults and does not knowingly collect data from children under 13.</p>
      <h2>Changes</h2>
      <p>We&apos;ll update this page if our practices change and revise the date above.</p>
    </div>
  );
}
