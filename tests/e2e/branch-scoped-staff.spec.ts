import { expect, test } from "@playwright/test";
import { BRANCH_STAFF_STATE_PATH } from "./global-setup";

/**
 * What a manager assigned to one counter can reach.
 *
 * WHAT THIS STANDS FOR, AND WHY THE OTHER SUITES CANNOT SEE IT.
 * ================================================================
 * tests/sql/staff-business-wide-permissions.test.ts proves the database and
 * lib/staff/roles.ts give the same answer for every permission and every kind
 * of person. tests/sql/staff-rls.test.ts proves an assigned session reads one
 * counter's branches, hours and holds. tests/unit/catalog-permission-call-sites
 * pins the gate onto each page at the source level.
 *
 * None of them can see the one thing that has to be true for any of it to
 * matter: that a real session, carrying a real profile, is actually refused at
 * the door. requireStaffPermission redirects rather than throwing, so a page
 * that lost its gate would not fail any test above; it would simply render.
 *
 * IT WRITES NOTHING. Every assertion here is a navigation and a read, so there
 * is no row to snapshot and restore. The account it signs in as already exists
 * in the project and is not created or modified by this file.
 */

test.use({ storageState: BRANCH_STAFF_STATE_PATH });

/** Where a page sends somebody who may not open it. */
const WORKSPACE_HOME = "/workspace";

test("names the counter this session acts on", async ({ page }) => {
  await page.goto(WORKSPACE_HOME);
  // The shell has no branch picker, so an assigned person has nowhere else to
  // check which counter their orders board is showing.
  await expect(page.getByRole("banner")).toContainText("Central Bloc");
});

test("keeps the shared catalog shut", async ({ page }) => {
  // The catalog carries no branch, so editing it from one counter edits all
  // nine. Each of these is a direct navigation, which is the case a hidden
  // button does not cover.
  for (const path of [
    "/workspace/menu/categories",
    "/workspace/menu/options",
    "/workspace/menu/items/new",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(new RegExp(`${WORKSPACE_HOME}$`));
  }
});

test("still opens the menu, without the catalog controls", async ({ page }) => {
  await page.goto("/workspace/menu");

  // menu:view and menu:availability are about one counter and survive the
  // assignment, so this page must still open. A change that took the whole
  // menu away from a branch manager would break their shift.
  await expect(page).toHaveURL(/\/workspace\/menu$/);
  await expect(page.getByText("Selling at").first()).toBeVisible();

  // The catalog half of the same screen is gone.
  await expect(page.getByRole("link", { name: "New item" })).toHaveCount(0);
});

test("keeps the menu in the navigation", async ({ page }) => {
  await page.goto(WORKSPACE_HOME);
  await expect(
    page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Menu" }),
  ).toBeVisible();
});

test("is not the Super Admin", async ({ page }) => {
  // Workspace access is the Super Admin's screen, and this account is not it.
  // Asserted here so a change that widened the team screen to managers cannot
  // pass unnoticed: it would hand branch assignment to the people it scopes.
  await page.goto("/workspace/team");
  await expect(page).toHaveURL(new RegExp(`${WORKSPACE_HOME}$`));
});
