import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuestForm } from "@/features/guests/components/guest-form";
import { GuestSearch } from "@/features/guests/components/guest-search";
import { listGuests } from "@/features/guests/queries";
import { requireOrgMembership } from "@/features/organizations/queries";
import { firstParam } from "@/lib/params";
import { guestListFilterSchema } from "@/schemas/guest";

export const metadata: Metadata = { title: "Guests" };

export default async function GuestsPage({ params, searchParams }: PageProps<"/[orgSlug]/guests">) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireOrgMembership(orgSlug);
  const filter = guestListFilterSchema.parse({ q: firstParam(sp.q), page: firstParam(sp.page) });
  const { guests, total, pageSize } = await listGuests(org.id, filter);
  const basePath = `/${org.slug}/guests`;

  return (
    <>
      <PageHeader title="Guests" description="Everyone you've had or plan to have on the show." />

      <Card>
        <CardHeader>
          <CardTitle>Add a guest</CardTitle>
          <CardDescription>
            You can also add guests straight from an episode when you book them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GuestForm orgId={org.id} />
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <GuestSearch action={basePath} q={filter.q} />
        {guests.length === 0 ? (
          <Card>
            <CardContent className="grid justify-items-center gap-3 py-10 text-center">
              <Users className="size-8 text-muted-foreground" />
              <p className="font-medium">{filter.q ? `No guests match "${filter.q}"` : "No guests yet"}</p>
              {!filter.q && (
                <p className="max-w-sm text-sm text-muted-foreground">
                  Add a guest above, or book one onto an episode.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="pr-6 text-right">Episodes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guests.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="pl-6 whitespace-normal">
                      <Link href={`${basePath}/${g.id}`} className="font-medium hover:underline">
                        {g.full_name}
                      </Link>
                      {g.email && (
                        <p className="text-xs break-all text-muted-foreground sm:hidden">{g.email}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {g.email ?? "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right text-sm">{g.bookingCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
        <Pagination
          basePath={basePath}
          searchParams={{ q: filter.q }}
          page={filter.page}
          pageSize={pageSize}
          total={total}
        />
      </div>
    </>
  );
}
