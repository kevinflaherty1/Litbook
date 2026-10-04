import { expect, test, type Page } from "@playwright/test";

import { signUpWithWorkspace, uniqueEmail } from "./helpers";

// A valid 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Host creates an episode, books a guest, and returns the guest's onboarding link. */
async function bookGuestAndGetLink(page: Page, guestName: string) {
  await page.getByRole("link", { name: "Episodes", exact: true }).click();
  await page.getByRole("link", { name: "New episode" }).first().click();
  await page.getByLabel("Title").fill("Poetical Science");
  await page.getByRole("button", { name: "Create episode" }).click();
  await expect(page.getByRole("heading", { name: "Poetical Science" })).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill(guestName);
  await page.getByRole("button", { name: "Add and book" }).click();
  const row = page.getByRole("listitem").filter({ hasText: guestName });
  await row.getByRole("button", { name: "Get link" }).click();
  const url = (await page.getByTestId("onboarding-url").textContent())!;
  await page.getByRole("button", { name: "Done" }).click();
  return { url, row };
}

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
