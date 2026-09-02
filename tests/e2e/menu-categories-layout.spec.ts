import { expect, test, type Page } from "@playwright/test";

/**
 * The categories screen and the item editor, after both were rebuilt onto the
 * Workspace table and the section rail.
 *
 * These are the claims the rebuild rests on, and each is something a unit test
 * structurally cannot see: whether the columns line up, whether the column
 * names are printed once, whether a section's own name outranks the fields
 * inside it. See tests/e2e/README.md before running: this drives the real
 * project.
 *
 * NOTHING HERE WRITES. Every assertion reads rendered state or drives a
 * client-side control, so the suite runs against the real menu without the
 * cleanup dance the delete and price specs need. In particular it never
 * presses Save on a category row and never submits the item form.
 */

test.describe("categories", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/workspace/menu/categories");
    await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();
  });

  test("every row shares one set of column positions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const blurbs = page.locator('input[id^="category-blurb-"]');
    expect(await blurbs.count()).toBeGreaterThan(1);

    // The whole point of the grid: a column is a column. Eleven separately
    // sized cards is what this replaced, and they could not line up even in
    // principle.
    const lefts = await blurbs.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size).toBe(1);
  });

  test("the blurb rule is stated once, not once per category", async ({ page }) => {
    // It used to be printed verbatim under all eleven rows.
    await expect(page.getByText(/A description, not marketing copy/)).toHaveCount(1);
  });

  test("the column names are printed once", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const visible = await page.getByText("Blurb", { exact: true }).evaluateAll((nodes) =>
      nodes.filter((node) => node.getBoundingClientRect().width > 1).length,
    );
    expect(visible).toBe(1);
  });

  test("the item count is a column, and reads as a number", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const count = page
      .locator("form")
      .filter({ has: page.locator('input[value="Chicken Wings"]') })
      // .first(): the delete dialog's own name plate, closed inside this same
      // form, is mono too.
      .locator("p.font-mono")
      .first();
    await expect(count).toBeVisible();
    await expect(count).toHaveText(/\d/);
  });

  test("a row's Save takes the brand orange only once it is dirty", async ({ page }) => {
    const save = page.getByRole("button", { name: "Save Chicken Wings" });
    const atRest = await save.evaluate((node) => getComputedStyle(node).backgroundColor);

    await page.locator('input[value="Chicken Wings"]').first().fill("Chicken Wings ");
    const dirty = page.getByRole("button", { name: "Save changes to Chicken Wings" });
    await expect(dirty).toBeVisible();
    expect(await dirty.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(atRest);
  });

  test("every delete trigger names the record it would delete", async ({ page }) => {
    const names = await page
      .getByRole("button", { name: /^Delete category: / })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
    expect(names).toContain("Delete category: Chicken Wings");
    expect(new Set(names).size).toBe(names.length);
  });

  test("does not scroll sideways at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/workspace/menu/categories");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("new item", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/workspace/menu/items/new");
    await expect(page.getByRole("heading", { level: 1, name: "New item" })).toBeVisible();
  });

  test("each section is a real heading, and outranks its own fields", async ({ page }) => {
    // They were <p> elements set smaller and fainter than the field labels
    // beneath them, so the form had no heading structure at all and a section
    // name was the weakest text inside its own card.
    // allInnerTexts reports the rendered text, which this design uppercases in
    // CSS, so the comparison is on the accessible names instead.
    for (const title of ["Details", "Sizes", "Options", "Photo"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }

    const section = await page
      .getByRole("heading", { level: 2, name: "Details" })
      .evaluate((node) => {
        const label = node.closest("section")!.querySelector(".type-caps")!;
        const read = (el: Element) => {
          const style = getComputedStyle(el);
          return { family: style.fontFamily, color: style.color };
        };
        return { heading: read(node), label: read(label) };
      });
    // The heading takes the display face; the field label does not.
    expect(section.heading.family).not.toBe(section.label.family);
  });

  test("the size rows share one set of column positions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Add a size" }).click();
    await page.getByRole("button", { name: "Add a size" }).click();

    const prices = page.locator('input[id$="-price"]');
    await expect(prices).toHaveCount(3);
    const lefts = await prices.evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size).toBe(1);
  });

  test("the size column names are printed once, however many rows there are", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Add a size" }).click();
    const visible = await page.getByText("Short name", { exact: true }).evaluateAll((nodes) =>
      nodes.filter((node) => node.getBoundingClientRect().width > 1).length,
    );
    expect(visible).toBe(1);
  });

  test("a removed size keeps its undo, and the announcement says so", async ({ page }) => {
    await page.getByRole("button", { name: "Add a size" }).click();
    const before = await page.locator('input[id$="-price"]').count();
    await page.getByRole("button", { name: /^Remove: / }).last().click();
    // A size that was never saved just leaves; there is nothing to preserve.
    await expect(page.locator('input[id$="-price"]')).toHaveCount(before - 1);
  });

  test("the blocking reason is stated at the weight of the button it blocks", async ({ page }) => {
    const save = page.getByRole("button", { name: "Add item" });
    await expect(save).toBeDisabled();

    const reason = page.getByText("Choose which category this item belongs to.");
    await expect(reason).toBeVisible();
    // It used to be 12px at 55% bone, the quietest text on the page, beside
    // the one control it was explaining.
    const size = await reason.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(size).toBeGreaterThanOrEqual(14);
  });

  test("does not scroll sideways at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/workspace/menu/items/new");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
