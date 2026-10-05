import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

import {
  bookGuestAndGetLink,
  completeMagicLink,
  completePortal,
  signUpWithWorkspace,
  uniqueEmail,
} from "./helpers";

test("owner exports workspace and guest data, then deletes their account", async ({ page, browser }) => {
  const email = uniqueEmail("owner");
  const slug = await signUpWithWorkspace(page, "Olive Owner", email, "Privacy Pod");
  const { url } = await bookGuestAndGetLink(page, "Ada Lovelace");
  const guestCtx = await browser.newContext();
  await completePortal(await guestCtx.newPage(), url, { shortBio: "Mathematician." });
  await guestCtx.close();

  // Workspace export: records plus files, with no secrets.
  await page.goto(`/${slug}/settings`);
  await expect(page.getByRole("link", { name: "Export workspace data" })).toBeVisible();
  const workspace = await page.request.get(`/${slug}/settings/export`);
  expect(workspace.status()).toBe(200);
  const entries = unzipSync(new Uint8Array(await workspace.body()));
  const names = Object.keys(entries);
  expect(names).toEqual(
    expect.arrayContaining([
      "README.txt",
      "organization.json",
      "members.json",
      "episodes.json",
      "guests.json",
      "bookings.json",
      "submissions.json",
      "custom_fields.json",
    ]),
  );
  expect(names.some((n) => n.startsWith("files/guest-assets/") && n.endsWith(".png"))).toBe(true);
  const members = JSON.parse(strFromU8(entries["members.json"]));
  expect(members[0]).toMatchObject({ email, role: "owner" });
  const submissions = JSON.parse(strFromU8(entries["submissions.json"]));
  expect(submissions[0]).toMatchObject({ short_bio: "Mathematician.", release_signed_name: "Ada Lovelace" });
  expect(strFromU8(entries["bookings.json"])).not.toContain("token_hash");

  // Guest export (subject access request): their record, signed release PDF and files.
  await page.goto(`/${slug}/guests`);
  await page.getByRole("link", { name: "Ada Lovelace" }).first().click();
  const exportHref = await page.getByRole("link", { name: "Export data" }).getAttribute("href");
  const guestZip = unzipSync(new Uint8Array(await (await page.request.get(exportHref!)).body()));
  const guestNames = Object.keys(guestZip);
  expect(guestNames).toContain("guest.json");
  expect(guestNames.some((n) => n.startsWith("releases/") && n.endsWith(".pdf"))).toBe(true);
  expect(guestNames.some((n) => n.startsWith("files/") && n.endsWith(".png"))).toBe(true);
  const guestJson = JSON.parse(strFromU8(guestZip["guest.json"]));
  expect(guestJson.guest.full_name).toBe("Ada Lovelace");
  expect(guestJson.bookings[0].submission.release_signed_name).toBe("Ada Lovelace");

  // Account page: personal data download.
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  const account = await page.request.get("/account/export");
  expect((await account.json()).account.email).toBe(email);

  // Sole member: the workspace is deleted with the account.
  await expect(page.getByText("These workspaces will be deleted too")).toBeVisible();
  await page.getByLabel(/Type .* to confirm/).fill(email);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
  await expect(page.getByText("Your account was deleted")).toBeVisible();

  // The session is gone, and signing in again starts a brand-new account.
  await page.goto(`/${slug}`);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await completeMagicLink(page, email);
  // Back at the old workspace URL, which no longer exists.
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("the workspace export is only served to the workspace's own team", async ({ page }) => {
  const slug = await signUpWithWorkspace(page, "Olive Owner", uniqueEmail("owner"), "Privacy Pod");
  // An unknown workspace (or one you're not in) is a 404; your own works.
  expect((await page.request.get(`/not-${slug}/settings/export`)).status()).toBe(404);
  expect((await page.request.get(`/${slug}/settings/export`)).status()).toBe(200);
});
