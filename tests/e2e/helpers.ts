import { expect, type Page } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export function uniqueEmail(name: string) {
  return `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Polls the local Mailpit inbox for the newest magic link sent to `email`. */
export async function getMagicLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json()) as {
        HTML: string;
      };
      const href = msg.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link email for ${email}`);
}

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
