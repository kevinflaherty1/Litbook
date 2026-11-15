import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap">
      <h1>Page not found</h1>
      <p>
        That page doesn&apos;t exist. Try the <Link href="/guides">guides</Link> or the{" "}
        <Link href="/tools/pressure-washing-price-calculator">price calculator</Link>.
      </p>
    </div>
  );
}
