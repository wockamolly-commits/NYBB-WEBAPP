import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * The menu list's search, filters and row actions.
 *
 * lib/staff/menu-browse.ts decides what a search and a filter keep, and
 * tests/unit/menu-browse.test.ts proves that. What it cannot see is the
 * screen: that typing narrows the rows without a reload, that the state is in
 * the address so Back returns to it, that the chips say how many they hold,
 * and that a delete pressed from a row asks first and then actually deletes.
 *
 * It creates the item it searches for and deletes whatever survives, off the
 * menu the whole time, so it never touches anything the business sells.
 */

const MENU = "/workspace/menu";
const ITEM_NAME_PREFIX = "E2E menu search";

let itemId: string | null = null;
let itemName = "";

function row(page: Page) {
  return page.locator("article").filter({ hasText: itemName });
}

test.beforeEach(async () => {
  const { data: category, error: categoryError } = await serviceClient()
    .from("menu_categories")
    .select("id")
    .limit(1)
    .single();
  if (categoryError) throw new Error(`no category to hang a test item on: ${categoryError.message}`);

  const stamp = Date.now();
  itemName = `${ITEM_NAME_PREFIX} ${stamp}`;
  const { data, error } = await serviceClient()
    .from("menu_items")
    .insert({
      category_id: category.id,
      slug: `e2e-menu-search-${stamp}`,
      name: itemName,
      code: `ZQ${String(stamp).slice(-4)}`,
      is_active: false,
      sort_order: 9999,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not create the test item: ${error.message}`);
  itemId = data.id;
});

test.afterEach(async () => {
  if (!itemId) return;
  await serviceClient().from("menu_items").delete().eq("id", itemId);
  itemId = null;
});

test("search narrows the list as you type, and keeps it in the address", async ({ page }) => {
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const search = page.getByRole("searchbox", { name: "Search the menu" });
  await expect(search).toBeVisible();

  const before = await page.locator("article").count();
  expect(before).toBeGreaterThan(1);

  await search.fill(itemName.toUpperCase());
  await expect(page.locator("article")).toHaveCount(1);
  await expect(row(page)).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /^Showing 1 of \d+ items$/ })).toBeVisible();
  await expect(page).toHaveURL(/\?q=/);

  // Survives a reload, which stands for opening an item and pressing Back.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("searchbox", { name: "Search the menu" })).toHaveValue(
    itemName.toUpperCase(),
  );
  await expect(page.locator("article")).toHaveCount(1);

  // Escape clears it and every row comes back.
  await page.getByRole("searchbox", { name: "Search the menu" }).press("Escape");
  await expect(page.locator("article")).toHaveCount(before);
  await expect(page).toHaveURL(/\/workspace\/menu$/);
});

test("finds an item by its code", async ({ page }) => {
  const { data } = await serviceClient().from("menu_items").select("code").eq("id", itemId!).single();
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "Search the menu" }).fill(data!.code!.toLowerCase());
  await expect(row(page)).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);
});

test("a search with no match says so and offers the way back", async ({ page }) => {
  await page.goto(`${MENU}?q=zzqqxx-no-such-thing`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page.getByText("Nothing matches")).toHaveCount(0);
  expect(await page.locator("article").count()).toBeGreaterThan(1);
});

test("the status chips filter, and say how many each holds", async ({ page }) => {
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const off = page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Off the menu/ });
  await expect(off).toHaveAttribute("aria-pressed", "false");

  const count = Number((await off.locator("span").innerText()).trim());
  expect(count).toBeGreaterThanOrEqual(1);

  await off.click();
  await expect(off).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article")).toHaveCount(count);
  // The throwaway item is off the menu, so it is in this slice.
  await expect(row(page)).toBeVisible();
  await expect(page).toHaveURL(/status=off-menu/);
});

test("a category chip shows that category alone", async ({ page }) => {
  const { data: item } = await serviceClient()
    .from("menu_items")
    .select("menu_categories(name)")
    .eq("id", itemId!)
    .single();
  const categoryName = (item!.menu_categories as unknown as { name: string }).name;

  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("group", { name: "Category" })
    .getByRole("button", { name: new RegExp(`^${categoryName} \\d+$`) })
    .click();

  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 2, name: categoryName })).toBeVisible();
  await expect(row(page)).toBeVisible();
});

test("deletes from the row, but only after asking", async ({ page }) => {
  await page.goto(`${MENU}?q=${encodeURIComponent(itemName)}`, { waitUntil: "domcontentloaded" });
  const trigger = row(page).getByRole("button", { name: `Delete item: ${itemName}` });

  // Cancel deletes nothing.
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "Delete item?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(itemName)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  const kept = await serviceClient().from("menu_items").select("id").eq("id", itemId!);
  expect(kept.data).toHaveLength(1);

  // Confirm does.
  await trigger.click();
  await dialog.getByRole("button", { name: "Delete item" }).click();
  await expect(page).toHaveURL(/\/workspace\/menu$/);
  await expect.poll(async () => {
    const { data } = await serviceClient().from("menu_items").select("id").eq("id", itemId!);
    return data?.length;
  }).toBe(0);
  itemId = null;
});

test("opens the editor from the row, and Back returns to the same search", async ({ page }) => {
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "Search the menu" }).fill(itemName);
  await expect(page.locator("article")).toHaveCount(1);

  await row(page).getByRole("link", { name: `Edit ${itemName}` }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/menu/items/${itemId}$`));

  await page.goBack();
  await expect(page.getByRole("searchbox", { name: "Search the menu" })).toHaveValue(itemName);
  await expect(page.locator("article")).toHaveCount(1);
});

test("never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("searchbox", { name: "Search the menu" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
