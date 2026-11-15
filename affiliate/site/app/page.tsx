import Link from "next/link";
import { getAllGuides } from "@/lib/content";

export default function Home() {
  const guides = getAllGuides();
  return (
    <div className="wrap wide">
      <section className="hero">
        <h1>Start a pressure washing or window cleaning business, the practical way.</h1>
        <p>
          Plain-English guides on pricing, startup costs, licensing and finding customers, plus
          free calculators and honest looks at the software that helps you quote, schedule and
          get paid.
        </p>
        <Link className="btn" href="/tools/pressure-washing-price-calculator">
          Try the price calculator →
        </Link>
      </section>

      <h2>Start here</h2>
      <div className="cards">
        {guides.map((g) => (
          <div className="card" key={g.slug}>
            <h3>
              <Link href={`/guides/${g.slug}`}>{g.title}</Link>
            </h3>
            <p className="small">{g.description}</p>
          </div>
        ))}
        <div className="card">
          <h3>
            <Link href="/tools/pressure-washing-price-calculator">Pressure Washing Price Calculator</Link>
          </h3>
          <p className="small">
            Get a starting price range for houses, driveways, decks and roofs in seconds.
          </p>
        </div>
      </div>
    </div>
  );
}
