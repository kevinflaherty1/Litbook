import { expect, test } from "@playwright/test";

import { completeMagicLink, signUp, uniqueEmail } from "./helpers";

test("signed-out visitors are sent to login and returned afterwards", async ({ page }) => {
  await page.goto("/some-workspace/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsome-workspace%2Fsettings/);
});

test("owner creates a workspace, invites a teammate, teammate joins", async ({ browser }) => {
  const ownerEmail = uniqueEmail("owner");
  const memberEmail = uniqueEmail("member");
  const slug = `show-${Date.now()}`;

  // Owner signs up and lands on onboarding (no workspaces yet).
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signUp(owner, "Olivia Owner", ownerEmail);
  await expect(owner).toHaveURL(/\/onboarding$/);

  // Reserved slugs are rejected client-side.
  await owner.getByLabel("Show or company name").fill("The Test Show");
  await owner.getByLabel("Workspace URL").fill("login");
  await owner.getByRole("button", { name: "Create workspace" }).click();
  await expect(owner.getByText("That URL is reserved")).toBeVisible();

  await owner.getByLabel("Workspace URL").fill(slug);
  await owner.getByRole("button", { name: "Create workspace" }).click();
  await expect(owner).toHaveURL(new RegExp(`/${slug}$`));
  await expect(owner.getByRole("heading", { name: "The Test Show", level: 1 })).toBeVisible();

  // Invite a member; email isn't configured locally, so the link is shown.
  await owner.getByRole("link", { name: "Team", exact: true }).click();
  await owner.getByLabel("Email").fill(memberEmail);
  await owner.getByRole("button", { name: "Send invite" }).click();
  const inviteUrl = await owner.getByTestId("invite-url").textContent();
  expect(inviteUrl).toMatch(/\/invite\/[\w-]{43}$/);
  await expect(owner.getByRole("cell", { name: memberEmail })).toBeVisible();

  // Member opens the invite while signed out → login → magic link → back to invite.
  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();
  await member.goto(inviteUrl!);
  await expect(member).toHaveURL(/\/login\?next=%2Finvite%2F/);
  await member.getByLabel("Work email").fill(memberEmail);
  await member.getByRole("button", { name: "Email me a sign-in link" }).click();
  await completeMagicLink(member, memberEmail);
  await expect(member.getByRole("heading", { name: "Join The Test Show" })).toBeVisible();
  await expect(member.getByText("Olivia Owner invited you to join as a member")).toBeVisible();

  await member.getByRole("button", { name: "Accept invitation" }).click();
  await expect(member).toHaveURL(new RegExp(`/${slug}$`));

  // Members can see the roster but not invite or edit settings.
  await member.getByRole("link", { name: "Team", exact: true }).click();
  await expect(member.getByText("2 people")).toBeVisible();
  await expect(member.getByRole("button", { name: "Send invite" })).toHaveCount(0);
  await member.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(member.getByText("Only owners and admins can change workspace settings.")).toBeVisible();
  await expect(member.getByLabel("Name", { exact: true })).toBeDisabled();

  // The invite link is single-use.
  await member.goto(inviteUrl!);
  await expect(member.getByRole("heading", { name: "Invitation not found" })).toBeVisible();

  // Owner promotes the member to admin.
  await owner.reload();
  await owner
    .getByRole("combobox", { name: /Role for/ })
    .nth(1)
    .click();
  await owner.getByRole("option", { name: "Admin" }).click();
  await expect(owner.getByText(/is now admin/)).toBeVisible();

  // The sole owner can't leave.
  await owner.getByRole("button", { name: "Leave" }).click();
  await owner.getByRole("button", { name: "Leave" }).last().click();
  await expect(owner.getByText("Your workspace needs at least one owner")).toBeVisible();

  await ownerCtx.close();
  await memberCtx.close();
});

test("users cannot open a workspace they don't belong to", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  const slug = `private-${Date.now()}`;
  await signUp(a, "Alex A", uniqueEmail("alex"));
  await a.getByLabel("Show or company name").fill("Private Show");
  await a.getByLabel("Workspace URL").fill(slug);
  await a.getByRole("button", { name: "Create workspace" }).click();
  await expect(a).toHaveURL(new RegExp(`/${slug}$`));

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await signUp(b, "Blake B", uniqueEmail("blake"));
  await b.goto(`/${slug}`);
  await expect(b.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await b.goto(`/${slug}/settings/team`);
  await expect(b.getByRole("heading", { name: "Page not found" })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
