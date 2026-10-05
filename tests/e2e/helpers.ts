import { expect, type Page } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export function uniqueEmail(name: string) {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Polls the local Mailpit inbox for the newest link to `path` in an email sent to `email`. */
export async function getEmailLink(email: string, path: string): Promise<string> {
  const pattern = new RegExp(`href="([^"]*${path.replace(/\//g, "\\/")}[^"]*)"`);
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    for (const m of messages ?? []) {
      const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)).json()) as { HTML: string };
      const href = msg.HTML.match(pattern)?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No email to ${email} with a ${path} link`);
}

export const getMagicLink = (email: string) => getEmailLink(email, "/auth/confirm");

/** Requests a magic link on the current login/signup page and follows it. */
export async function completeMagicLink(page: Page, email: string) {
  await expect(page.getByText("Check your email")).toBeVisible();
  await page.goto(await getMagicLink(email));
}

export async function signUp(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await completeMagicLink(page, email);
}

/** Signs up a new user and creates a workspace for them. Returns its slug. */
export async function signUpWithWorkspace(page: Page, name: string, email: string, showName: string) {
  const slug = `show-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  await signUp(page, name, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Show or company name").fill(showName);
  await page.getByLabel("Workspace URL").fill(slug);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));
  return slug;
}

// A valid 1×1 PNG.
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Host creates an episode, books a guest, and returns the guest's onboarding link. */
export async function bookGuestAndGetLink(page: Page, guestName: string, episodeTitle = "Poetical Science") {
  await page.getByRole("link", { name: "Episodes", exact: true }).click();
  await page.getByRole("link", { name: "New episode" }).first().click();
  await page.getByLabel("Title").fill(episodeTitle);
  await page.getByRole("button", { name: "Create episode" }).click();
  await expect(page.getByRole("heading", { name: episodeTitle })).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill(guestName);
  await page.getByRole("button", { name: "Add and book" }).click();
  const row = page
    .getByRole("list", { name: "Booked guests" })
    .getByRole("listitem")
    .filter({ hasText: guestName });
  await row.getByRole("button", { name: "Get link" }).click();
  const url = (await page.getByTestId("onboarding-url").textContent())!;
  await page.getByRole("button", { name: "Done" }).click();
  return { url, row, episodeUrl: page.url() };
}

/** The guest fills in the portal form with a headshot and signs. */
export async function completePortal(
  guest: Page,
  url: string,
  details: { shortBio: string; headline?: string },
  options: { keepPage?: boolean } = {},
) {
  // keepPage: continue on the already-open portal page (e.g. after uploading files).
  if (!options.keepPage) await guest.goto(url);
  if (details.headline) await guest.getByLabel("Headline").fill(details.headline);
  await guest.getByLabel("Short bio").fill(details.shortBio);
  await guest.getByLabel("Website").fill("ada.dev");
  await guest.getByLabel("X / Twitter").fill("@ada");
  await guest.getByLabel("Headshot").setInputFiles({ name: "ada.png", mimeType: "image/png", buffer: PNG });
  await expect(guest.getByText("Looking good!")).toBeVisible();
  await guest.getByLabel("I have read and agree").check();
  await guest.getByLabel("Type your full name to sign").fill("Ada Lovelace");
  await guest.getByRole("button", { name: /Send to my host|Save my updates/ }).click();
  await expect(guest).toHaveURL(/\/done$/);
}
