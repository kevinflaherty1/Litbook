import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EpisodeForm } from "@/features/episodes/components/episode-form";
import { requireOrgMembership } from "@/features/organizations/queries";

export const metadata: Metadata = { title: "New episode" };

export default async function NewEpisodePage({ params }: PageProps<"/[orgSlug]/episodes/new">) {
  const { orgSlug } = await params;
  const { org } = await requireOrgMembership(orgSlug);

  return (
    <>
      <PageHeader title="New episode" description="You can book guests once it's created." />
      <Card>
        <CardContent>
          <EpisodeForm orgId={org.id} />
        </CardContent>
      </Card>
    </>
  );
}
