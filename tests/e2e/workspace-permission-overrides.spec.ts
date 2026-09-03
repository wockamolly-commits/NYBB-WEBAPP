import { expect, test } from "@playwright/test";
import { ADMIN_STATE_PATH } from "./global-setup";

/**
 * The Manage permissions panel on the Workspace access screen.
 *
 * WHY THIS EXISTS.
 * ================================================================
 * Thirteen switches per card, inside a card that already carries a form for
 * the role and the branch. Two things about that can only be seen in a
 * browser. The first is the nesting: a form inside a form is silently dropped
 * by the HTML parser, so the panel would render, the switches would look
 * right, and pressing one would submit the role form instead. Nothing in Node
 * can see it, because there is no parser involved. The second is the panel
 * expanded: the card grew from one row of controls to a hundred, at the
 * breakpoint where the list already has the narrowest column it will ever get.
 *
 * IT SIGNS IN AS THE OWNER'S OWN ACCOUNT, and therefore NOTHING HERE WRITES.
 * The panel it is looking at can only be reached by the configured Super
 * Admin, so there is no other session to use, and the rule from README.md
 * applies: every assertion reads. It never presses a switch. Whether a press
 * writes the right row is covered where it can be covered without touching the
 * real project, in tests/sql/staff-permission-overrides.test.ts, which drives
 * admin_set_staff_permission through every outcome against a real Postgres.
 */

test.use({ storageState: ADMIN_STATE_PATH });

const TEAM = "/workspace/team";

/** The member cards. The Super Admin's own card carries no controls. */
function cards(page: import("@playwright/test").Page) {
  return page
    .locator("li")
    .filter({ has: page.getByRole("combobox", { name: "Branch" }) });
}

function panel(card: ReturnType<typeof cards>) {
  return card.locator("section").filter({
    has: card.page().getByRole("heading", { name: "Manage permissions" }),
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto(TEAM);
  await expect(page.getByRole("heading", { level: 1, name: "Workspace access" })).toBeVisible();
});

test("gives every staff card a permissions panel, and the Super Admin none", async ({
  page,
}) => {
  const rows = cards(page);
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Manage permissions" })).toHaveCount(count);
});

test("keeps the panel out of the role form, where its switches would be dropped", async ({
  page,
}) => {
  // The bug this stands for does not throw and does not warn. A nested form is
  // removed by the parser, so the thirteen submit buttons would end up in the
  // role form and pressing one would save the role.
  const nested = await page.evaluate(
    () => document.querySelectorAll("form form").length,
  );
  expect(nested).toBe(0);

  const orphaned = await page.evaluate(() =>
    [...document.querySelectorAll('button[role="switch"]')].filter(
      (node) => node.closest("form")?.querySelector('input[name="profileId"]') == null,
    ).length,
  );
  expect(orphaned).toBe(0);
});

test("starts collapsed and opens on request", async ({ page }) => {
  const first = panel(cards(page).first());
  const toggle = first.getByRole("button", { name: /permissions$/ });

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(first.getByRole("switch")).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  // Thirteen, not fourteen. team:manage is deliberately not offered, because
  // this screen admits the Super Admin by profile role and never checks it.
  await expect(first.getByRole("switch")).toHaveCount(13);
  await expect(first.getByRole("button", { name: "Hide permissions" })).toBeVisible();
});

test("counts the switches that are on, and agrees with the switches", async ({ page }) => {
  const first = panel(cards(page).first());
  await first.getByRole("button", { name: "Show permissions" }).click();

  const heading = await first.getByText(/\d+\/13 on/).first().textContent();
  const claimed = Number(/(\d+)\/13 on/.exec(heading ?? "")?.[1]);
  const actuallyOn = await first.getByRole("switch").evaluateAll(
    (nodes) => nodes.filter((node) => node.getAttribute("aria-checked") === "true").length,
  );
  expect(actuallyOn).toBe(claimed);
});

test("says which permissions come from the role rather than from a decision", async ({
  page,
}) => {
  const first = panel(cards(page).first());
  await first.getByRole("button", { name: "Show permissions" }).click();

  // A card with no override rows is every switch on its default, which is what
  // the badge says. At least one has to carry it, or the badge is not wired.
  await expect(first.getByText("Default").first()).toBeVisible();

  // And each switch is named and described, rather than being an unlabelled
  // pill a screen reader announces as "button".
  await expect(
    first.getByRole("switch", { name: "View dashboard" }),
  ).toHaveAttribute("aria-checked", /true|false/);
});

test("does not scroll sideways at 320px with a panel open", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await panel(cards(page).first()).getByRole("button", { name: "Show permissions" }).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("leaves the switches alone on a revoked account", async ({ page }) => {
  // A revoked card offers Restore and nothing else. Changing what an account
  // that cannot sign in is allowed to do is a control that does nothing today
  // and something surprising the day it is restored.
  const revoked = cards(page).filter({ hasText: "Revoked" });
  if ((await revoked.count()) === 0) test.skip(true, "no revoked account in this project");

  const first = panel(revoked.first());
  await first.getByRole("button", { name: "Show permissions" }).click();
  await expect(first.getByRole("switch").first()).toBeDisabled();
  await expect(first.getByText(/This account is revoked/)).toBeVisible();
});
