import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Affiliate Disclosure", description: `How ${site.name} makes money.` };

export default function Disclosure() {
  return (
    <div className="wrap prose">
      <h1>Affiliate Disclosure</h1>
      <p>
        {site.name} is reader-supported. Some links on this site are affiliate links. If you click
        one and sign up or buy, we may earn a commission at no additional cost to you.
      </p>
      <p>
        We may participate in partner programs for business software (for example, field-service
        and quoting apps), business services and equipment retailers. If we join Amazon
        Associates, this applies: as an Amazon Associate we earn from qualifying purchases.
      </p>
      <p>
        Companies do not pay for placement in our guides or rankings, and a commission never
        changes our verdicts. We recommend free options when they&apos;re good enough, and we say
        when a product isn&apos;t worth it.
      </p>
      <p>Sponsored content, if we ever publish any, will be clearly labeled as sponsored.</p>
      <p>
        Questions: <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
      <p className="small">Last updated: 2026-11-15</p>
    </div>
  );
}
