import { expect, test } from "@playwright/test";

import { bookGuestAndGetLink, getEmailLink, PNG, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("guest completes onboarding with only the link, then edits it", async ({ page, browser }) => {
  await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Deep Dive Radio");
  const { url, row } = await bookGuestAndGetLink(page, "Ada Lovelace");

  // The guest has no account and uses a phone-sized screen.
  const guestCtx = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const guest = await guestCtx.newPage();
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: "Hi Ada, welcome to the show" })).toBeVisible();
  await expect(guest.getByText("Deep Dive Radio").first()).toBeVisible();
  await expect(guest.getByLabel("Name", { exact: true })).toHaveValue("Ada Lovelace");

  // Client-side validation.
  await guest.getByRole("button", { name: "Send to my host" }).click();
  await expect(guest.getByText("Add a short bio.")).toBeVisible();
  await expect(guest.getByText("Please agree to the release to continue.")).toBeVisible();

  await guest.getByLabel("Short bio").fill("Mathematician and the first computer programmer.");
  await guest.getByLabel("Website").fill("ada.dev");
  await guest.getByLabel("X / Twitter").fill("@ada");
  await guest.getByLabel("I have read and agree").check();
  await guest.getByLabel("Type your full name to sign").fill("Ada Lovelace");

  // The headshot is required (checked on the server).
  await guest.getByRole("button", { name: "Send to my host" }).click();
  await expect(guest.getByText("Please add a headshot.").first()).toBeVisible();

  // Wrong file type is rejected in the browser; a PNG uploads straight to Storage.
  await guest
    .getByLabel("Headshot")
    .setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(guest.getByText("Please choose a JPG, PNG or WebP image.")).toBeVisible();
  await guest.getByLabel("Headshot").setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: PNG });
  await expect(guest.getByText("Looking good!")).toBeVisible();

  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await guest.getByRole("button", { name: "Send to my host" }).click();
  await expect(guest).toHaveURL(/\/done$/);
  await expect(guest.getByRole("heading", { name: "You're all set!" })).toBeVisible();

  // The host sees the submission.
  await page.reload();
  await expect(row.getByText("Submitted").first()).toBeVisible();
  await expect(row.getByText(/^Submitted .+/)).toBeVisible();

  // The guest comes back to edit: details are prefilled and the headshot is kept.
  await guest.getByRole("link", { name: "Edit my details" }).click();
  await expect(guest.getByText("You've already sent your details")).toBeVisible();
  await expect(guest.getByLabel("Website")).toHaveValue("https://ada.dev");
  await expect(guest.getByLabel("X / Twitter")).toHaveValue("@ada");
  await expect(guest.getByRole("img", { name: "Your headshot" })).toBeVisible();
  await guest.getByLabel("Headline").fill("Countess of Lovelace");
  await guest.getByLabel("I have read and agree").check();
  await guest.getByLabel("Type your full name to sign").fill("Ada Lovelace");
  await guest.getByRole("button", { name: "Save my updates" }).click();
  await expect(guest).toHaveURL(/\/done$/);

  // Cancelling the booking turns the link off.
  await row.getByRole("button", { name: "More actions for Ada Lovelace" }).click();
  await page.getByRole("menuitem", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(row.getByText("Cancelled")).toBeVisible();
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: "This link isn't working" })).toBeVisible();

  await guestCtx.close();
});

test("unknown and rotated links show a friendly error", async ({ page, browser }) => {
  await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Deep Dive Radio");
  const { url, row } = await bookGuestAndGetLink(page, "Grace Hopper");

  await row.getByRole("button", { name: "New link" }).click();
  await page.getByRole("button", { name: "Create new link" }).click();
  const newUrl = (await page.getByTestId("onboarding-url").textContent())!;

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: "This link isn't working" })).toBeVisible();
  await guest.goto("/submit/not-a-real-token");
  await expect(guest.getByRole("heading", { name: "This link isn't working" })).toBeVisible();
  await guest.goto(newUrl);
  await expect(guest.getByRole("heading", { name: "Hi Grace, welcome to the show" })).toBeVisible();

  // Opening the link is shown to the host.
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(row.getByText(/^Opened /)).toBeVisible();
  await guestCtx.close();
});

test("host emails the link and the guest opens it from their inbox", async ({ page, browser }) => {
  const slug = await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Inbox Show");
  const guestEmail = uniqueEmail("guest");

  await page.getByRole("link", { name: "Episodes", exact: true }).click();
  await page.getByRole("link", { name: "New episode" }).first().click();
  await page.getByLabel("Title").fill("Mail Call");
  await page.getByRole("button", { name: "Create episode" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Mia Mailed");
  await page.getByLabel("Email (optional)").fill(guestEmail);
  await page.getByRole("button", { name: "Add and book" }).click();

  const row = page
    .getByRole("list", { name: "Booked guests" })
    .getByRole("listitem")
    .filter({ hasText: "Mia Mailed" });
  await row.getByRole("button", { name: "Email link" }).click();
  await expect(page.getByText(`Link emailed to ${guestEmail}`)).toBeVisible();
  await expect(row.getByText(/^Emailed /)).toBeVisible();

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(await getEmailLink(guestEmail, "/submit/"));
  await expect(guest.getByRole("heading", { name: "Hi Mia, welcome to the show" })).toBeVisible();
  await guestCtx.close();

  // Reminders can be turned off per workspace.
  await page.goto(`/${slug}/settings`);
  const toggle = page.getByLabel("Remind guests who haven't sent their details");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(page.getByText("Guest reminders turned off")).toBeVisible();
  await page.reload();
  await expect(toggle).not.toBeChecked();
});
