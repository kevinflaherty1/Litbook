import { expect, test } from "@playwright/test";

import { bookGuestAndGetLink, completePortal, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("billing is off without Stripe keys, and an owner can delete the workspace", async ({
  page,
  browser,
}) => {
  const slug = await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Doomed Show");

  // No Stripe keys locally: no Billing nav, no paywall, and the page says so.
  await expect(page.getByRole("link", { name: "Billing" })).toHaveCount(0);
  await page.goto(`/${slug}/settings/billing`);
  await expect(page.getByText("Billing isn't set up")).toBeVisible();

  // Collect some data, including a stored headshot.
  await page.goto(`/${slug}`);
  const { url } = await bookGuestAndGetLink(page, "Ada Lovelace");
  const guestCtx = await browser.newContext();
  await completePortal(await guestCtx.newPage(), url, { shortBio: "First programmer." });
  await guestCtx.close();

  // Delete: the button stays disabled until the URL is typed exactly.
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const deleteButton = page.getByRole("button", { name: "Delete workspace" });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(/to confirm/).fill("wrong");
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(/to confirm/).fill(slug);
  await deleteButton.click();

  // With no workspaces left, the user is sent to create one; the old URL 404s.
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  // The guest's link died with the workspace.
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "This link isn't working" })).toBeVisible();
});
