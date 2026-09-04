import { expect, test } from "@playwright/test";
import { BRANCH_STAFF_STATE_PATH } from "./global-setup";

/**
 * The sales report, as a person meets it.
 *
 * WHAT THIS STANDS FOR.
 * ================================================================
 * tests/sql/order-analytics.test.ts proves the figures and proves that an
 * assigned manager cannot read another counter. Neither of those can see the
 * two things that decide whether this screen works: that all twenty-four hours
 * are actually drawn, and that a chart wider than the viewport scrolls inside
 * its own box rather than making the page scroll sideways. DESIGN.md calls
 * horizontal overflow on the body a bug, and it is invisible to every other
 * suite here because it is a property of the rendered layout.
 *
 * The branch picker is the third: the report tells the page whether the caller
 * is pinned, so a control appearing for somebody the database would refuse is
 * a disagreement only a browser can catch.
 *
 * IT WRITES NOTHING. Every assertion is a navigation and a read.
 */

const ANALYTICS = "/workspace/analytics";

test.describe("as a business-wide manager", () => {
  test("is reachable from the workspace navigation", async ({ page }) => {
    await page.goto("/workspace");
    await page
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("link", { name: "Analytics" })
      .click();
    await expect(page).toHaveURL(new RegExp(`${ANALYTICS}$`));
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  });

  test("draws every hour of the day, including the empty ones", async ({ page }) => {
    await page.goto(ANALYTICS);
    await page.getByRole("group").filter({ hasText: "Hour by hour" }).click();

    const table = page.getByRole("table", { name: /each hour of the day/i });
    // Twenty four data rows and one header row. A chart that plotted only the
    // hours with orders in them would rescale its own axis and make a quiet
    // day look like a rush.
    await expect(table.getByRole("row")).toHaveCount(25);
    await expect(table.getByRole("rowheader", { name: "00:00" })).toBeVisible();
    await expect(table.getByRole("rowheader", { name: "23:00" })).toBeVisible();
  });

  test("keeps the wide content inside its own scroller", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ANALYTICS);
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, "the page body scrolls sideways at 375px").toBe(false);
  });

  test("offers the counter filter, because this session is not pinned", async ({ page }) => {
    await page.goto(ANALYTICS);
    await expect(page.getByText("Counter", { exact: true })).toBeVisible();
  });

  test("says so when the dates are the wrong way round", async ({ page }) => {
    await page.goto(`${ANALYTICS}?from=2026-08-31&to=2026-08-01`);
    // Filtered rather than taken bare, because Next renders its route
    // announcer as an empty role="alert" div on every page. A bare
    // getByRole("alert") matches both and passes or fails on which one
    // hydrates first, which is a flake rather than a check.
    await expect(
      page.getByRole("alert").filter({ hasText: "Swap the two dates" }),
    ).toBeVisible();
    // The report is still drawn beneath it rather than replaced by the notice.
    await expect(page.getByRole("heading", { name: "Orders and revenue by hour" })).toBeVisible();
  });
});

test.describe("as a manager assigned to one counter", () => {
  test.use({ storageState: BRANCH_STAFF_STATE_PATH });

  test("opens the report with no counter filter on it", async ({ page }) => {
    await page.goto(ANALYTICS);
    // The database pins this session to Central Bloc and ignores any branch
    // argument from it, so a picker here would be a control the report cannot
    // honour.
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByText("Counter", { exact: true })).toHaveCount(0);
  });
});
