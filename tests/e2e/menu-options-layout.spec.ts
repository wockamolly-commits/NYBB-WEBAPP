import { expect, test, type Page } from "@playwright/test";

/**
 * The option groups screen, after it was rebuilt from fifteen independent
 * wrapping forms into one table per group.
 *
 * These are the claims the rebuild rests on, and each of them is a thing a
 * unit test structurally cannot see: whether the columns line up, whether a
 * disclosure actually keeps its fields submittable, whether Save changes
 * weight when there is something to save. See tests/e2e/README.md before
 * running: this drives the real project.
 *
 * NOTHING HERE WRITES. Every assertion reads rendered state or toggles a
 * client-side disclosure, so the suite can run against the real menu without
 * the cleanup dance the delete and price specs need.
 */

const OPTIONS = "/workspace/menu/options";

/** The group card whose heading is `name`. */
function group(page: Page, name: string) {
  return page.locator("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

test.beforeEach(async ({ page }) => {
  await page.goto(OPTIONS);
  await expect(page.getByRole("heading", { level: 1, name: "Option groups" })).toBeVisible();
});

test("every option row shares one set of column positions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const flavour = group(page, "Flavour");
  // Scoped to the option rows: the group's own name field, shut inside the
  // Edit group panel, carries the same `name` attribute.
  const names = flavour.locator('input[id*="option-"][id$="-name"]');
  await expect(names).toHaveCount(10); // nine flavours and the blank new row

  // The whole point of the grid: a column is a column. Reading the left edge
  // of each row's pricing trigger is the cheapest way to prove that the rows
  // are not each sizing themselves from their own contents, which is exactly
  // what the wrapping flex row they replaced did.
  const boxes = await flavour.locator('[id$="-pricing"]').evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().left)),
  );
  expect(boxes.length).toBeGreaterThan(1);
  expect(new Set(boxes).size).toBe(1);
});

test("the column names are printed once, not once per row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const flavour = group(page, "Flavour");
  // "Pricing" is a visible header exactly once in the group. Every row still
  // carries its own label for assistive technology, folded away at this width
  // by sr-only rather than deleted, so the count of *visible* ones is the
  // assertion worth making.
  const visible = await flavour.getByText("Pricing", { exact: true }).evaluateAll((nodes) =>
    nodes.filter((node) => node.getBoundingClientRect().width > 1).length,
  );
  expect(visible).toBe(1);
});

test("the group's own fields stay submittable while the disclosure is shut", async ({ page }) => {
  const flavour = group(page, "Flavour");
  const nameField = flavour.locator('input[name="name"][id^="group-name-"]');

  // Hidden, not unmounted. The action reads a required name, so a disclosure
  // that dropped the field from the DOM would post a nameless group the first
  // time somebody flipped "On the menu" with the panel shut.
  await expect(nameField).toBeHidden();
  await expect(nameField).toHaveValue("Flavour");
  await expect(nameField).toHaveAttribute("required", "");

  await flavour.getByRole("button", { name: "Edit group" }).click();
  await expect(nameField).toBeVisible();
});

test("changing the group's switch opens the panel that can commit it", async ({ page }) => {
  const flavour = group(page, "Flavour");
  const save = flavour.getByRole("button", { name: "Save group" });
  await expect(save).toBeHidden();

  await flavour.getByRole("checkbox", { name: "On the menu: Flavour" }).click();
  await expect(save).toBeVisible();

  // Put it back. Returning to the saved value is no longer a change, so the
  // panel closes again and nothing was written.
  await flavour.getByRole("checkbox", { name: "On the menu: Flavour" }).click();
  await expect(save).toBeHidden();
});

test("a row's Save only takes the brand orange once there is something to save", async ({ page }) => {
  const flavour = group(page, "Flavour");
  const save = flavour.getByRole("button", { name: "Save Classic Buffalo" });
  const fill = () => save.evaluate((node) => getComputedStyle(node).backgroundColor);

  const atRest = await fill();
  await flavour.locator(`#option-${await optionId(page)}-name`).fill("Classic Buffalo!");
  const dirty = await flavour.getByRole("button", { name: "Save changes to Classic Buffalo" });
  await expect(dirty).toBeVisible();
  expect(await dirty.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(atRest);
});

/** The id of the Classic Buffalo row, read off its own name input. */
async function optionId(page: Page): Promise<string> {
  const id = await page
    .locator('input[name="name"][value="Classic Buffalo"]')
    .first()
    .getAttribute("id");
  return (id ?? "").replace(/^option-/, "").replace(/-name$/, "");
}

test("the photo editor is shut on load and opens from the row's thumbnail", async ({ page }) => {
  const flavour = group(page, "Flavour");
  const toggle = flavour.getByRole("button", { name: /photograph for Classic Buffalo/ });

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  // Matched by attribute rather than by an id selector: useId() emits colons,
  // which a CSS id selector would have to escape and Node has no CSS.escape.
  const panelId = await toggle.getAttribute("aria-controls");
  const panel = page.locator(`[id="${panelId}"]`);
  await expect(panel).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
});

test("the heat column is a group decision, and appears across every row at once", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const flavour = group(page, "Flavour");
  const rows = await flavour.locator('input[id*="option-"][id$="-name"]').count();
  const heat = flavour.locator('input[id$="-heat"]');

  // All or nothing, whatever the saved data happens to be. The claim is that
  // the column belongs to the table and not to whichever row carries a value,
  // so a group showing heat shows it on every row including the blank one.
  //
  // Not asserted as "zero to begin with": whether the flavour group opens with
  // the column depends on whether any flavour has a heat percent saved, which
  // is live data somebody can change from this very screen.
  const before = await heat.count();
  expect([0, rows]).toContain(before);

  const show = flavour.getByRole("button", { name: "Show heat level" });
  if (before === 0) await show.click();
  else await expect(show).toBeHidden();

  await expect(heat).toHaveCount(rows);
});

test("the amount column opens for the whole table when one row starts charging", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const flavour = group(page, "Flavour");
  await expect(flavour.getByText("Amount", { exact: true })).toHaveCount(0);

  await flavour.locator('[id$="-pricing"]').first().click();
  await page.getByRole("option", { name: "Adds an amount" }).click();

  // The header cell appears, and so does the input on the row that asked for
  // it, while the other rows hold the column open with an empty cell.
  await expect(flavour.getByText("Amount", { exact: true }).first()).toBeVisible();
  await expect(flavour.locator('input[id$="-amount"]')).toHaveCount(1);
});

test("the page does not scroll sideways at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(OPTIONS);
  await expect(page.getByRole("heading", { level: 1, name: "Option groups" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("every delete trigger names the record it would delete", async ({ page }) => {
  const flavour = group(page, "Flavour");
  // Icon-only, so the accessible name is the only thing a screen reader has.
  // Nine buttons all called "Delete option" would be nine identical choices.
  const names = await flavour
    .getByRole("button", { name: /^Delete option: / })
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  expect(names).toContain("Delete option: Classic Buffalo");
  expect(new Set(names).size).toBe(names.length);
});
