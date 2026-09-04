import { expect, test } from "@playwright/test";
import { ADMIN_STATE_PATH } from "./global-setup";

/**
 * The navigation row, when it does not fit.
 *
 * An admin sees thirteen tabs, so the row scrolls on anything narrower than a
 * wide desktop and always on the counter tablet. Two things about that are
 * only true in a rendered page. The row has to scroll rather than squeeze,
 * because a flex row of thirteen shrunken tabs is thirteen unreadable stubs.
 * And the current tab has to be inside the part of the row you can see, which
 * it was not: on a tablet the highlight was regularly parked off screen, so
 * the one signal saying where you are was the one signal you could not read.
 *
 * Signed in as the admin deliberately. A smaller bar might fit the viewport,
 * and a test where nothing overflows proves nothing about overflow.
 *
 * IT WRITES NOTHING. Every assertion is a navigation and a read.
 */

test.use({ storageState: ADMIN_STATE_PATH });

const RAIL = { name: "Workspace" };

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
});

test("scrolls the row instead of squeezing the tabs into it", async ({ page }) => {
  await page.goto("/workspace");
  const rail = page.getByRole("navigation", RAIL);

  const overflowing = await rail.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflowing, "thirteen tabs fit 900px, so this test proves nothing").toBe(true);

  // One row, not two: every tab shares the first one's vertical position. A
  // wrapped bar would put the later ones on a second line.
  const tops = await rail.evaluate((el) =>
    [...el.children].map((child) => Math.round(child.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);
});

test("brings the current tab into view on a route near the end of the row", async ({ page }) => {
  await page.goto("/workspace/profile");
  const rail = page.getByRole("navigation", RAIL);
  const current = rail.getByRole("link", { name: "Profile" });
  await expect(current).toHaveAttribute("aria-current", "page");

  const railBox = await rail.boundingBox();
  const tabBox = await current.boundingBox();
  if (!railBox || !tabBox) throw new Error("the rail or the current tab was not laid out");

  expect(tabBox.x).toBeGreaterThanOrEqual(railBox.x - 1);
  expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(railBox.x + railBox.width + 1);
});

test("leaves the first tab where it is when that is the current one", async ({ page }) => {
  // Centring a tab that is already at the start of the row would scroll the
  // row away from its own beginning for no reason.
  await page.goto("/workspace");
  const rail = page.getByRole("navigation", RAIL);
  expect(await rail.evaluate((el) => el.scrollLeft)).toBe(0);
});

test("does not make the page scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/workspace");
  await expect(page.getByRole("navigation", RAIL)).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows, "the navigation row scrolls the body sideways at 375px").toBe(false);
});
