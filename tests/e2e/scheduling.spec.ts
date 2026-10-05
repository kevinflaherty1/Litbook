import { expect, test } from "@playwright/test";

import { bookGuestAndGetLink, getEmailLink, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("host offers recording times and the guest picks one", async ({ page, browser }) => {
  const hostEmail = uniqueEmail("host");
  await signUpWithWorkspace(page, "Hana Host", hostEmail, "Deep Dive Radio");
  const { url, row, episodeUrl } = await bookGuestAndGetLink(page, "Ada Lovelace");

  // Meeting link in the episode details.
  await page.getByLabel("Recording link").fill("riverside.fm/studio/deep-dive");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Episode saved")).toBeVisible();

  // Offer two 45-minute times.
  await page.getByLabel("Recording time 1").fill("2030-01-15T15:00");
  await page.getByRole("button", { name: "Another time" }).click();
  await page.getByLabel("Recording time 2").fill("2030-01-16T10:30");
  await page.getByLabel("Length").selectOption("45");
  await page.getByRole("button", { name: "Add times" }).click();
  await expect(page.getByText("2 times added")).toBeVisible();
  const times = page.getByRole("list", { name: "Recording times" });
  await expect(times.getByRole("listitem")).toHaveCount(2);
  await expect(times.getByText("Open")).toHaveCount(2);

  // The guest picks the first time.
  const guestCtx = await browser.newContext({ timezoneId: "Europe/London" });
  const guest = await guestCtx.newPage();
  await guest.goto(url);
  await expect(guest.getByText("Pick a recording time")).toBeVisible();
  const options = guest.getByRole("radiogroup", { name: "Recording times" }).getByRole("radio");
  await expect(options).toHaveCount(2);
  await options.first().click();
  await guest.getByRole("button", { name: "Confirm time" }).click();
  await expect(guest.getByText("You're booked to record")).toBeVisible();
  await expect(guest.getByRole("link", { name: "https://riverside.fm/studio/deep-dive" })).toBeVisible();
  await expect(guest.getByRole("link", { name: "Google Calendar" })).toHaveAttribute(
    "href",
    /calendar\.google\.com.*dates=/,
  );

  // The guest's calendar invite.
  const invite = await guest.request.get(`${url}/invite.ics`);
  expect(invite.headers()["content-type"]).toContain("text/calendar");
  const ics = await invite.text();
  expect(ics).toContain("DTEND:");
  expect(ics).toContain("LOCATION:https://riverside.fm/studio/deep-dive");

  // The host is told, and sees who picked what.
  expect(await getEmailLink(hostEmail, "#schedule")).toContain("/episodes/");
  await page.reload();
  await expect(times.getByText("Picked by Ada Lovelace")).toBeVisible();
  await expect(row.getByText(/^Recording /)).toBeVisible();
  const hostIcs = await (await page.request.get(`${episodeUrl}/calendar.ics`)).text();
  expect(hostIcs).toContain('SUMMARY:Recording "Poetical Science" with Ada Lovelace');

  // Changing to the other time frees the first.
  await guest.getByRole("button", { name: "Change time" }).click();
  await options.first().click();
  await guest.getByRole("button", { name: "Confirm time" }).click();
  await expect(guest.getByText("You're booked to record")).toBeVisible();
  await page.reload();
  await expect(times.getByText("Open")).toHaveCount(1);

  // "I can't make it" gives the time back.
  await guest.getByRole("button", { name: "I can't make it" }).click();
  await expect(guest.getByText("Pick a recording time")).toBeVisible();
  await page.reload();
  await expect(times.getByText("Open")).toHaveCount(2);

  // The host removes a time; the guest no longer sees it.
  await times.getByRole("button", { name: "Remove this time" }).first().click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(times.getByRole("listitem")).toHaveCount(1);
  await guest.reload();
  await expect(options).toHaveCount(1);

  await guestCtx.close();
});
