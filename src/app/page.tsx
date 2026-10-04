import Link from "next/link";
import { FileSignature, Image as ImageIcon, Link2, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";

const FEATURES = [
  {
    icon: Link2,
    title: "One link per guest",
    body: "Book a guest, send a secure link. They don't need an account or a password.",
  },
  {
    icon: ImageIcon,
    title: "Headshots and bios in one place",
    body: "Bios, social links and high-res headshots land in your asset vault, ready to copy.",
  },
  {
    icon: FileSignature,
    title: "Signed releases on file",
    body: "Guests sign your release form. You keep the signature and the exact wording they agreed to.",
  },
  {
    icon: ShieldCheck,
    title: "Built for teams",
    body: "Invite producers and co-hosts. Each workspace's data is isolated.",
  },
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-3xl gap-6 px-6 py-20 text-center md:py-28">
          <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-6xl">
            Stop chasing guests for headshots.
          </h1>
          <p className="text-lg text-balance text-muted-foreground">
            Litbook sends every guest one secure link and collects their bio, headshot, social links and
            signed release, so you can get back to making the show.
          </p>
          <div className="flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href={user ? "/dashboard" : "/signup"}>
                {user ? "Open dashboard" : "Start free trial"}
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="grid gap-2 rounded-xl border p-6">
              <Icon className="size-5 text-muted-foreground" />
              <h2 className="font-medium">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Litbook
      </footer>
    </div>
  );
}
