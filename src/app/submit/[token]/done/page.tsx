import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getOnboardingContext } from "@/features/portal/queries";
import { logoPublicUrl } from "@/lib/branding";

export default async function SubmittedPage({ params }: PageProps<"/submit/[token]/done">) {
  const { token } = await params;
  const ctx = await getOnboardingContext(token);
  if (!ctx) notFound();
  const logoUrl = logoPublicUrl(ctx.organization.logo_path);

  return (
    <Card>
      <CardContent className="grid justify-items-center gap-4 py-10 text-center">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- public Storage URL
          <img src={logoUrl} alt={`${ctx.organization.name} logo`} className="h-12 max-w-48 object-contain" />
        )}
        <CircleCheck className="size-12 text-emerald-600" />
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re all set!</h1>
        <p className="max-w-md text-muted-foreground">
          {ctx.organization.name} has your details and signed release for{" "}
          <span className="font-medium text-foreground">{ctx.episode.title}</span>. We&apos;ve let them know.
        </p>
        {!ctx.is_locked && (
          <Button asChild variant="outline">
            <Link href={`/submit/${token}`}>Edit my details</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
