import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact", description: `Contact ${site.name}.` };

export default function Contact() {
  return (
    <div className="wrap prose">
      <h1>Contact</h1>
      <p>
        Spotted a mistake, have a question, or run a pressure washing or window cleaning business
        and want to share what works? Email{" "}
        <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
      <p>We read everything and fix errors quickly. Corrections are noted on the updated article.</p>
    </div>
  );
}
