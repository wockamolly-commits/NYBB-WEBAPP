import { expect, test } from "@playwright/test";
import { ADMIN_STATE_PATH } from "./global-setup";

/**
 * Workspace access, the one screen only the Super Admin can open.
 *
 * WHY THIS EXISTS.
 * ================================================================
 * The branch control shipped without any browser coverage, because this page
 * redirects everybody who is not the configured Super Admin and every other
 * persona in this suite is ordinary staff. It broke on the first look: the card
 * was a two column grid whose controls column sizes to its own content and will
 * not shrink, so adding a third control pushed the row past the card and the
 * only column that could give was the person's name. It collapsed to about
 * sixty pixels, "Cashier at Central Bloc, IT Park" wrapped one word per line,
 * and the revoke panel came down over the top of it.
 *
 * No unit or SQL test can see any of that. This is the shape of check the menu
 * and options screens already carry, on the screen that had none.
 *
 * IT SIGNS IN AS THE OWNER'S OWN ACCOUNT, and therefore NOTHING HERE WRITES.
 * Every assertion reads rendered geometry. It never presses Save role, never
 * submits the grant form, and never opens the revoke confirmation, so it leaves
 * no profile change and no audit row behind.
 */

test.use({ storageState: ADMIN_STATE_PATH });

const TEAM = "/workspace/team";

/**
 * The widths this screen has to hold together at.
 *
 * 1024 is the one that matters and the one the defect was found at: it is the
 * breakpoint where the page splits into the grant form and the list, so the
 * list gets the narrowest column it will ever have while still sitting beside
 * something. At 1440 there is enough room that a squeezed name still looks
 * survivable, which is exactly why checking only the wide case would have let
 * this through.
 */
const WIDTHS = [1024, 1440];

/** The member cards. The Super Admin's own card carries no form and is excluded. */
function cards(page: import("@playwright/test").Page) {
  return page
    .locator("li")
    .filter({ has: page.getByRole("combobox", { name: "Branch" }) });
}

test.beforeEach(async ({ page }) => {
  await page.goto(TEAM);
  await expect(page.getByRole("heading", { level: 1, name: "Workspace access" })).toBeVisible();
});

for (const width of WIDTHS) {
  test(`keeps the details clear of the controls on every card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const rows = cards(page);
    expect(await rows.count()).toBeGreaterThan(0);

    for (let index = 0; index < (await rows.count()); index += 1) {
      const row = rows.nth(index);
      const details = row.locator("div.min-w-0").first();
      // The role and branch form specifically. The card grew a second one when
      // the permissions panel arrived, and this check is about where the role
      // controls sit relative to the person's name.
      const form = row
        .locator("form")
        .filter({ has: page.getByRole("combobox", { name: "Branch" }) });

      const detailsBox = await details.boundingBox();
      const formBox = await form.boundingBox();
      if (!detailsBox || !formBox) throw new Error("a member card did not render");

      // The regression, stated as geometry: the two are stacked, so the details
      // end before the controls begin. Side by side is what squeezed the name.
      expect(Math.round(detailsBox.y + detailsBox.height), `card ${index} rows at ${width}`)
        .toBeLessThanOrEqual(Math.round(formBox.y) + 1);

      // And the details get the width of the card rather than whatever the
      // controls left over, which at 1024 was about 30 pixels.
      expect(detailsBox.width, `card ${index} details width at ${width}`).toBeGreaterThan(400);
    }
  });
}

test("says where each person works, on one line", async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS[0]!, height: 1000 });
  const line = cards(page).first().getByText(/ at /).first();

  await expect(line).toBeVisible();
  const box = await line.boundingBox();
  if (!box) throw new Error("the role and branch line did not render");
  // "Cashier at Central Bloc, IT Park" set one word per line was 7 lines tall.
  expect(box.height).toBeLessThan(48);
});

test("lines the controls up across the cards", async ({ page }) => {
  await page.setViewportSize({ width: WIDTHS[0]!, height: 1000 });
  const roles = cards(page).getByRole("combobox", { name: "Role" });
  expect(await roles.count()).toBeGreaterThan(1);

  const lefts = await roles.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
  );
  expect(new Set(lefts).size).toBe(1);
});

test("asks the grant form for a branch rather than assuming one", async ({ page }) => {
  const grant = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Grant access" }),
  });

  // Where somebody works is the point of this form, so it starts unanswered.
  // A preselected counter is a wrong assignment nobody had to agree to.
  await expect(grant.getByRole("combobox", { name: "Branch" })).toHaveText(/Choose a branch/);
  await expect(grant.getByRole("combobox", { name: "Workspace role" })).toHaveText(/Cashier/);
});

test("offers the counters that are not trading yet, and says so", async ({ page }) => {
  const grant = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Grant access" }),
  });
  await grant.getByRole("combobox", { name: "Branch" }).click();

  // Eight of the nine are not open. Staffing a shop before it opens is a real
  // thing to want, so they are offered with the state said out loud rather
  // than hidden.
  await expect(page.getByRole("option", { name: /All branches/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /not trading/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("does not scroll sideways at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
