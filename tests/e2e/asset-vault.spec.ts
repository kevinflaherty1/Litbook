import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";

import { bookGuestAndGetLink, completePortal, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("host reviews assets, exports them, and locks the submission", async ({ page, browser }) => {
  await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Deep Dive Radio");
  const { url, row, episodeUrl } = await bookGuestAndGetLink(page, "Ada Lovelace", "Poetical Science");

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await completePortal(guest, url, { shortBio: "Frist programmer.", headline: "Countess of Lovelace" });

  // Episode page: show notes and the export.
  await page.reload();
  await expect(page.getByTestId("show-notes")).toContainText("Ada Lovelace, Countess of Lovelace");
  await expect(page.getByTestId("show-notes")).toContainText("X / Twitter: https://x.com/ada");

  const zip = await page.request.get(`${episodeUrl}/export`);
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  const entries = unzipSync(new Uint8Array(await zip.body()));
  expect(Object.keys(entries).sort()).toEqual(["guests.md", "headshots/ada-lovelace.png"]);
  expect(strFromU8(entries["guests.md"])).toContain("**Headshot:** headshots/ada-lovelace.png");

  // Booking page (Asset Vault).
  await row.getByRole("link", { name: "Ada Lovelace" }).click();
  await expect(page.getByRole("heading", { name: "Ada Lovelace", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: "Headshot of Ada Lovelace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy short bio" })).toBeVisible();
  await expect(page.getByRole("link", { name: "@ada" })).toHaveAttribute("href", "https://x.com/ada");
  await expect(page.getByRole("link", { name: "https://ada.dev" })).toHaveAttribute("target", "_blank");

  const headshot = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download headshot" }).click();
  expect((await headshot).suggestedFilename()).toBe("ada-lovelace.png");

  const release = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  const pdf = await release;
  expect(pdf.suggestedFilename()).toBe("release-ada-lovelace.pdf");
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.getByText(/Signed by Ada Lovelace on/)).toBeVisible();

  // Fix a typo; the guest sees the correction.
  await page.getByLabel("Short bio", { exact: true }).fill("First programmer.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Guest details saved")).toBeVisible();
  await expect(page.getByText("First programmer.").first()).toBeVisible();

  // Mark ready → the portal is locked; reopen → editable again.
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("Marked ready: guest edits are locked")).toBeVisible();
  await guest.goto(url);
  await expect(guest.getByText("Your details are finalized")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Save my updates" })).toHaveCount(0);

  await page.getByRole("button", { name: "Reopen for edits" }).click();
  await expect(page.getByText("Reopened: the guest can edit again")).toBeVisible();
  await guest.reload();
  await expect(guest.getByLabel("Short bio")).toHaveValue("First programmer.");

  // Another workspace can't fetch the export, headshot, or release.
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await signUpWithWorkspace(other, "Otto Other", uniqueEmail("other"), "Other Show");
  const bookingUrl = page.url();
  expect((await other.request.get(`${episodeUrl}/export`)).status()).toBe(404);
  expect((await other.request.get(`${bookingUrl}/headshot`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await other.request.get(`${bookingUrl}/release`)).status()).toBe(404);

  await guestCtx.close();
  await otherCtx.close();
});
