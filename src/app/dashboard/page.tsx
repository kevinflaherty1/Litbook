import { redirect } from "next/navigation";

import { getMyOrganizations } from "@/features/organizations/queries";

/** Post-login landing: first workspace, or onboarding if there is none. */
export default async function DashboardRedirect() {
  const orgs = await getMyOrganizations();
  redirect(orgs.length ? `/${orgs[0].slug}` : "/onboarding");
}
