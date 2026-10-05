import { expect, test } from "@playwright/test";

import { bookGuestAndGetLink, PNG, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("host brands the guest page and asks custom questions", async ({ page, browser }) => {
  const slug = await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Deep Dive Radio");

  // Branding: logo, colour and a welcome message.
  await page.goto(`/${slug}/settings`);
  await page.getByLabel("Logo file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Deep Dive Radio logo" })).toBeVisible();
  await page.getByLabel("Brand colour", { exact: true }).fill("#0F766E");
  await page.getByLabel("Welcome message").fill("We record on Riverside. Bring headphones!");
  await page.getByRole("button", { name: "Save guest page" }).click();
  await expect(page.getByText("Guest page updated")).toBeVisible();

  // Questions: one required short answer, one multiple choice.
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("What would you like to promote?");
  await page.getByLabel("Required").check();
  await page.getByRole("dialog").getByRole("button", { name: "Add question" }).click();
  await expect(page.getByText("Question added")).toBeVisible();

  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Preferred topic");
  await page.getByLabel("Answer type").selectOption("select");
  await page.getByLabel("Options").fill("AI\nDesign");
  await page.getByRole("dialog").getByRole("button", { name: "Add question" }).click();
  const questions = page.getByRole("list", { name: "Guest questions" });
  await expect(questions.getByRole("listitem")).toHaveCount(2);

  // Reorder: the multiple-choice question moves to the top.
  await page.getByRole("button", { name: 'Move "Preferred topic" up' }).click();
  await expect(questions.getByRole("listitem").first()).toContainText("Preferred topic");

  const { url, row } = await bookGuestAndGetLink(page, "Ada Lovelace");

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await guest.goto(url);
  await expect(guest.getByRole("img", { name: "Deep Dive Radio logo" })).toBeVisible();
  await expect(guest.getByText("We record on Riverside. Bring headphones!")).toBeVisible();
  const submit = guest.getByRole("button", { name: "Send to my host" });
  await expect(submit).toHaveCSS("background-color", "rgb(15, 118, 110)");

  await guest.getByLabel("Short bio").fill("Mathematician.");
  await guest.getByLabel("Headshot").setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: PNG });
  await expect(guest.getByText("Looking good!")).toBeVisible();
  await guest.getByLabel("I have read and agree").check();
  await guest.getByLabel("Type your full name to sign").fill("Ada Lovelace");
  await submit.click();
  await expect(guest.getByText("This question is required.")).toBeVisible();

  await guest.getByLabel("Preferred topic (optional)").selectOption("AI");
  await guest.getByLabel("What would you like to promote?").fill("My new book, Notes on the Engine");
  await submit.click();
  await expect(guest).toHaveURL(/\/done$/);

  // The answers show up in the vault.
  await page.reload();
  await row.getByRole("link", { name: "Ada Lovelace" }).click();
  const answers = page.locator("#answers");
  await expect(answers).toContainText("My new book, Notes on the Engine");
  await expect(answers).toContainText("AI");

  // Archiving hides a question from guests but keeps the answer.
  await page.goto(`/${slug}/settings`);
  await page.getByRole("button", { name: 'Archive "Preferred topic"' }).click();
  await expect(page.getByText("Question archived")).toBeVisible();
  await guest.goto(url);
  await expect(guest.getByLabel("What would you like to promote?")).toHaveValue(
    "My new book, Notes on the Engine",
  );
  await expect(guest.getByLabel("Preferred topic (optional)")).toHaveCount(0);

  await guestCtx.close();
});
