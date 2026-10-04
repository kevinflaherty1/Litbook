import { expect, test } from "@playwright/test";

import { signUpWithWorkspace, uniqueEmail } from "./helpers";

const ONBOARDING_URL = /\/submit\/[\w-]{43}$/;

test("host creates an episode, books guests, and gets onboarding links", async ({ page, browser }) => {
  const slug = await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Deep Dive Radio");
  const adaEmail = uniqueEmail("ada");

  // Empty state → new episode.
  await page.getByRole("link", { name: "Episodes", exact: true }).click();
  await expect(page.getByText("No episodes yet")).toBeVisible();
  await page.getByRole("link", { name: "New episode" }).first().click();

  await page.getByLabel("Title").fill("The Analytical Engine");
  await page.getByLabel("Episode number").fill("0");
  await page.getByRole("button", { name: "Create episode" }).click();
  await expect(page.getByText("Episode numbers start at 1.")).toBeVisible();

  await page.getByLabel("Episode number").fill("7");
  await page.getByLabel("Recording date").fill("2030-01-15T10:00");
  await page.getByRole("button", { name: "Create episode" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}/episodes/[0-9a-f-]{36}$`));
  await expect(page.getByRole("heading", { name: "#7 The Analytical Engine" })).toBeVisible();
  const episodeUrl = page.url();

  // Book a brand-new guest.
  await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
  await page.getByLabel("Email (optional)").fill(adaEmail.toUpperCase());
  await page.getByRole("button", { name: "Add and book" }).click();
  await expect(page.getByText("Ada Lovelace added and booked")).toBeVisible();
  const adaRow = page.getByRole("listitem").filter({ hasText: "Ada Lovelace" });
  await expect(adaRow.getByText("Waiting on guest")).toBeVisible();
  await expect(adaRow.getByText(adaEmail)).toBeVisible(); // stored lowercased
  await expect(adaRow.getByText("No link yet")).toBeVisible();

  // Generate the onboarding link; it's shown once.
  await adaRow.getByRole("button", { name: "Get link" }).click();
  const firstUrl = await page.getByTestId("onboarding-url").textContent();
  expect(firstUrl).toMatch(ONBOARDING_URL);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(adaRow.getByText(/Link expires/)).toBeVisible();

  // Regenerating asks first, then rotates the link.
  await adaRow.getByRole("button", { name: "New link" }).click();
  await page.getByRole("button", { name: "Create new link" }).click();
  const secondUrl = await page.getByTestId("onboarding-url").textContent();
  expect(secondUrl).toMatch(ONBOARDING_URL);
  expect(secondUrl).not.toBe(firstUrl);
  await page.getByRole("button", { name: "Done" }).click();

  // Booking the same email again reuses the directory entry and is rejected as a duplicate.
  await page.getByLabel("Name", { exact: true }).fill("Ada L.");
  await page.getByLabel("Email (optional)").fill(adaEmail);
  await page.getByRole("button", { name: "Add and book" }).click();
  await expect(page.getByText("Ada Lovelace is already booked on this episode.")).toBeVisible();

  // Guest directory: email dedupe, then add someone to book from the directory.
  await page.getByRole("link", { name: "Guests", exact: true }).click();
  await expect(page.getByRole("row", { name: /Ada Lovelace/ })).toBeVisible();
  await page.getByLabel("Name").fill("Someone Else");
  await page.getByLabel("Email").fill(adaEmail);
  await page.getByRole("button", { name: "Add guest" }).click();
  await expect(page.getByText("A guest with this email is already in your directory.")).toBeVisible();

  await page.getByLabel("Name").fill("Grace Hopper");
  await page.getByLabel("Email").fill("");
  await page.getByRole("button", { name: "Add guest" }).click();
  await expect(page.getByText("Grace Hopper added to your directory")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search guests" }).fill("grace");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("row", { name: /Grace Hopper/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Ada Lovelace/ })).toHaveCount(0);

  await page.goto(episodeUrl);
  await page.getByRole("combobox", { name: "From your guest directory" }).click();
  await page.getByRole("option", { name: /Grace Hopper/ }).click();
  await page.getByRole("button", { name: "Book guest" }).click();
  await expect(page.getByText("Grace Hopper booked")).toBeVisible();
  const graceRow = page.getByRole("listitem").filter({ hasText: "Grace Hopper" });

  // Cancel → restore → remove.
  await graceRow.getByRole("button", { name: "More actions for Grace Hopper" }).click();
  await page.getByRole("menuitem", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(graceRow.getByText("Cancelled")).toBeVisible();
  await expect(graceRow.getByRole("button", { name: "Get link" })).toHaveCount(0);
  await graceRow.getByRole("button", { name: "Restore" }).click();
  await expect(graceRow.getByText("Waiting on guest")).toBeVisible();
  await graceRow.getByRole("button", { name: "More actions for Grace Hopper" }).click();
  await page.getByRole("menuitem", { name: "Remove from episode" }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Grace Hopper was removed from this episode")).toBeVisible();
  await expect(graceRow).toHaveCount(0);

  // The episode list and filters.
  await page.getByRole("link", { name: "Episodes", exact: true }).first().click();
  const episodeRow = page.getByRole("row", { name: /The Analytical Engine/ });
  await expect(episodeRow.getByText("1 guest")).toBeVisible();
  await page.getByRole("link", { name: "Published" }).click();
  await expect(page.getByText("No published episodes")).toBeVisible();

  // The overview shows the upcoming recording and status counts.
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByRole("link", { name: /The Analytical Engine/ })).toBeVisible();
  await expect(page.getByTestId("stat-Waiting on guest")).toHaveText("1");

  // Fits a phone screen without sideways scrolling.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(episodeUrl);
  await expect(page.getByRole("listitem").filter({ hasText: "Ada Lovelace" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  // Another workspace's user gets a 404 for this episode; junk ids 404 too.
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  const otherSlug = await signUpWithWorkspace(other, "Otto Other", uniqueEmail("other"), "Other Show");
  await other.goto(episodeUrl);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const episodeId = episodeUrl.split("/").pop();
  await other.goto(`/${otherSlug}/episodes/${episodeId}`);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await other.goto(`/${otherSlug}/episodes/not-a-uuid`);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await otherCtx.close();
});
