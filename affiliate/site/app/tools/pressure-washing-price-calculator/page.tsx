import type { Metadata } from "next";
import Link from "next/link";
import { surfaces } from "@/lib/pricing";
import Calculator from "./Calculator";

export const metadata: Metadata = {
  title: "Pressure Washing Price Calculator (Free, 2026 Rates)",
  description:
    "Estimate what to charge for house washing, driveways, decks, fences and roof soft washing, using published 2026 per-square-foot rates.",
  alternates: { canonical: "/tools/pressure-washing-price-calculator" },
};

const fmt = (n: number) => `$${n.toFixed(2)}`;

export default function Page() {
  return (
    <div className="wrap">
      <h1>Pressure Washing Price Calculator</h1>
      <p className="meta">Free · No signup · Rates reviewed November 2026</p>
      <p>
        Enter the surfaces and square footage for a job to get a starting price range. Add
        several surfaces (say, a house wash plus the driveway) to price a whole job.
      </p>

      <Calculator />

      <div className="prose">
        <h2>How the calculator works</h2>
        <p>
          It multiplies your square footage by the low and high end of published per-square-foot
          rates for each surface, then applies a condition adjustment, adds oil stain treatments,
          and makes sure the total isn&apos;t below your job minimum.
        </p>
        <table>
          <thead>
            <tr>
              <th>Surface</th>
              <th>Low $/sq ft</th>
              <th>High $/sq ft</th>
            </tr>
          </thead>
          <tbody>
            {surfaces.map((s) => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{fmt(s.low)}</td>
                <td>{fmt(s.high)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li>
            <strong>Condition adjustment</strong> (our own rule of thumb, not from a source): moderate
            +15%, heavy +30%.
          </li>
          <li>
            <strong>Oil stains:</strong> $25–$75 per stain treatment.
          </li>
          <li>
            <strong>Job minimum:</strong> many operators set a minimum of $150–$350 so small jobs
            still cover drive time and setup. The default here is $150.
          </li>
        </ul>

        <h2>Before you send a quote</h2>
        <ul>
          <li>
            <strong>Check your local market.</strong> Rates vary a lot by region. Call or look up
            two or three local companies and see where they land.
          </li>
          <li>
            <strong>Price for risk and access.</strong> Second stories, steep roofs, delicate
            surfaces and long drives belong at the top of the range or above it.
          </li>
          <li>
            <strong>Watch your hourly rate.</strong> Estimate how long the job takes. If the price
            works out below what you need per hour, raise it.
          </li>
        </ul>
        <p>
          Want the full breakdown? Read{" "}
          <Link href="/guides/how-much-to-charge-for-pressure-washing">how much to charge for pressure washing</Link>.
        </p>

        <h2>Sources</h2>
        <p className="small">
          Rates compiled from published 2026 pricing guides, including{" "}
          <a href="https://www.zarla.com/guides/how-much-to-charge-for-pressure-washing" rel="noopener" target="_blank">Zarla</a>,{" "}
          <a href="https://www.housecallpro.com/resources/how-to-price-pressure-washing-jobs/" rel="noopener" target="_blank">Housecall Pro</a>,{" "}
          <a href="https://makewash.com/blog/pressure-washing-prices-rates-2026" rel="noopener" target="_blank">MakeWash</a>,{" "}
          <a href="https://www.billbooks.com/blog/pressure-washing-pricing-per-square-foot/" rel="noopener" target="_blank">BillBooks</a>,{" "}
          <a href="https://blog.lawnguru.co/pressure-washing-cost/" rel="noopener" target="_blank">LawnGuru</a> and{" "}
          <a href="https://www.crewnest.app/blog/how-much-does-pressure-washing-cost" rel="noopener" target="_blank">Crewnest</a>.
          Where sources disagreed we used the range most of them shared. Results are estimates,
          not a guarantee of what customers will pay.
        </p>
      </div>
    </div>
  );
}
