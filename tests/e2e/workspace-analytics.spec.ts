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

test.describe("the date pickers", () => {
  /**
   * The calendar the browser used to draw was welded to the bottom edge of the
   * field, in a widget layer no stylesheet reaches, and on the filter card it
   * read as a rendering fault. WorkspaceDateField replaces it, and everything
   * that made the replacement worth doing is a measurement of the rendered
   * page: where the panel sits, how far it is from the field, and whether it
   * drags the body sideways on a phone. None of that is visible to a unit test.
   */

  const FROM = "Choose the from date";
  const THROUGH = "Choose the through date";

  test("opens clear of the field, and on the field's own left edge", async ({ page }) => {
    // Tall enough that there is room underneath, because the point of this
    // test is where the panel goes when it has a choice. With less room it
    // flips above the field, which is the positioner working rather than a
    // regression, and the test below covers the flip.
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.goto(ANALYTICS);
    await page.getByRole("button", { name: FROM }).click();

    const field = await page.locator("#analytics-from").boundingBox();
    const calendar = await page.getByRole("grid").boundingBox();
    if (!field || !calendar) throw new Error("the field or the calendar was not laid out");

    // A gap, which is the whole complaint. The panel used to touch the field.
    const gap = calendar.y - (field.y + field.height);
    expect(gap).toBeGreaterThan(4);
    expect(gap).toBeLessThan(80);
    // And the left edges agree, rather than the panel hanging off the little
    // button that opened it.
    expect(Math.abs(calendar.x - field.x)).toBeLessThan(20);
  });

  test("places the second calendar exactly as it places the first", async ({ page }) => {
    // Left at whatever height the runner gives it, so this also passes over a
    // viewport short enough to flip the panel above the field: the two have to
    // agree either way, which is the half of the complaint that was about the
    // pair rather than about one of them.
    await page.goto(ANALYTICS);

    async function offsets(trigger: string, input: string) {
      await page.getByRole("button", { name: trigger }).click();
      const field = await page.locator(input).boundingBox();
      const calendar = await page.getByRole("grid").boundingBox();
      if (!field || !calendar) throw new Error("the field or the calendar was not laid out");
      await page.keyboard.press("Escape");
      return { offset: calendar.y - field.y, inset: calendar.x - field.x };
    }

    const from = await offsets(FROM, "#analytics-from");
    const through = await offsets(THROUGH, "#analytics-to");
    expect(through.offset).toBeCloseTo(from.offset, 0);
    expect(through.inset).toBeCloseTo(from.inset, 0);
  });

  test("writes the day you pick into the field it belongs to", async ({ page }) => {
    await page.goto(`${ANALYTICS}?from=2026-08-29&to=2026-09-04`);
    await page.getByRole("button", { name: THROUGH }).click();
    await page.getByRole("button", { name: "Tuesday, 15 September 2026" }).click();

    await expect(page.locator("#analytics-to")).toHaveValue("2026-09-15");
    // The other field is untouched, and the panel is gone.
    await expect(page.locator("#analytics-from")).toHaveValue("2026-08-29");
    await expect(page.getByRole("grid")).toHaveCount(0);
  });

  test("opens on Alt+Down and walks the month with the arrow keys", async ({ page }) => {
    await page.goto(`${ANALYTICS}?from=2026-08-29&to=2026-09-04`);
    // Alt+Down is the browser's own shortcut for its panel, so this is also
    // the check that its panel cannot come back on top of ours.
    await page.locator("#analytics-from").focus();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.getByRole("grid")).toBeVisible();

    // Focus lands on the day the field already holds, and a week down from
    // 29 August is 5 September, which is in the next month.
    await expect(page.getByRole("button", { name: "Saturday, 29 August 2026" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#analytics-from")).toHaveValue("2026-09-05");
  });

  test("does not drag the page sideways when it opens on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ANALYTICS);
    await page.getByRole("button", { name: FROM }).click();
    await expect(page.getByRole("grid")).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, "an open calendar scrolls the body sideways at 375px").toBe(false);
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
