import { expect, test } from "@playwright/test";

import { bookGuestAndGetLink, signUpWithWorkspace, uniqueEmail } from "./helpers";

test("pages send security headers and a nonce-based CSP", async ({ request }) => {
  const res = await request.get("/login");
  const headers = res.headers();
  const csp = headers["content-security-policy"];
  expect(csp).toMatch(/script-src 'self' 'nonce-[\w+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("unsafe-eval");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-powered-by"]).toBeUndefined();

  // A new nonce on every request.
  const again = (await request.get("/login")).headers()["content-security-policy"];
  expect(again).not.toBe(csp);
});

test("the app runs under the CSP without violations", async ({ page, browser }) => {
  const violations: string[] = [];
  const watch = (msg: { text(): string }) => {
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(msg.text()))
      violations.push(msg.text());
  };
  page.on("console", watch);

  await signUpWithWorkspace(page, "Hana Host", uniqueEmail("host"), "Strict Show");
  const { url } = await bookGuestAndGetLink(page, "Ada Lovelace");
  // A full page load, so the inline date-formatting script runs.
  await page.reload();
  await expect(page.getByText(/Link expires/)).toBeVisible();

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  guest.on("console", watch);
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: /welcome to the show/ })).toBeVisible();
  await guestCtx.close();

  expect(violations).toEqual([]);
});

test("robots.txt and the health check are public", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /");

  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true });
});
