import { expect, test } from "@playwright/test";
import { unzipSync } from "fflate";

import { bookGuestAndGetLink, completePortal, PNG, signUpWithWorkspace, uniqueEmail } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, ...new Array(400).fill(0)]);

test("host asks for extra files and the guest uploads them", async ({ page, browser }) => {
  const slug = await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Deep Dive Radio");
  await page.goto(`/${slug}/settings`);
  // Each box saves on change; wait for the save (the fieldset re-enables) before the next.
  for (const label of ["Company logo", "Intro audio", "Media kit"]) {
    await page.getByLabel(label).check();
    await expect(page.getByLabel(label)).toBeEnabled();
    await expect(page.getByLabel(label)).toBeChecked();
  }
  await page.reload();
  await expect(page.getByLabel("Company logo")).toBeChecked();
  await expect(page.getByLabel("Media kit")).toBeChecked();

  const { url, row, episodeUrl } = await bookGuestAndGetLink(page, "Ada Lovelace");
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(url);

  // Wrong type is rejected in the browser; the right ones upload.
  await guest.getByLabel("Media kit").setInputFiles({ name: "kit.png", mimeType: "image/png", buffer: PNG });
  await expect(guest.getByText("That file type isn't supported.")).toBeVisible();
  await guest
    .getByLabel("Media kit")
    .setInputFiles({ name: "Ada press kit.pdf", mimeType: "application/pdf", buffer: PDF });
  await expect(guest.getByText("Ada press kit.pdf")).toBeVisible();
  await guest
    .getByLabel("Intro audio")
    .setInputFiles({ name: "intro.mp3", mimeType: "audio/mpeg", buffer: MP3 });
  await expect(guest.getByText("intro.mp3")).toBeVisible();
  await completePortal(guest, url, { shortBio: "Mathematician." }, { keepPage: true });

  // Vault: both files, with an audio preview and downloads.
  await page.reload();
  await row.getByRole("link", { name: "Ada Lovelace" }).click();
  const files = page.locator("#files");
  await expect(files).toContainText("Ada press kit.pdf");
  await expect(files.locator("audio")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await files.getByRole("link", { name: "Download media kit" }).click();
  expect((await download).suggestedFilename()).toBe("Ada press kit.pdf");

  // The episode export includes them.
  const zip = unzipSync(new Uint8Array(await (await page.request.get(`${episodeUrl}/export`)).body()));
  expect(Object.keys(zip).sort()).toEqual([
    "files/ada-lovelace-intro-audio.mp3",
    "files/ada-lovelace-media-kit.pdf",
    "guests.md",
    "headshots/ada-lovelace.png",
  ]);

  // The guest removes the media kit; it's gone from the vault.
  await guest.goto(url);
  await guest.getByRole("button", { name: "Remove media kit" }).click();
  await guest.getByLabel("I have read and agree").check();
  await guest.getByLabel("Type your full name to sign").fill("Ada Lovelace");
  await guest.getByRole("button", { name: "Save my updates" }).click();
  await expect(guest).toHaveURL(/\/done$/);
  await page.reload();
  await expect(files).not.toContainText("Ada press kit.pdf");
  await expect(files).toContainText("intro.mp3");

  await guestCtx.close();
});
