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

test("the available chip keeps what the database says can be sold now", async ({ page }) => {
  // The same question menu_item_is_available() answers, asked of the tables
  // directly: on, in a category that is on, and no hold still running. The
  // e2e persona is business wide, so it reads every counter's holds.
  const db = serviceClient();
  const [{ data: items }, { data: holds }] = await Promise.all([
    db.from("menu_items").select("id, is_active, menu_categories(is_active)"),
    db
      .from("menu_item_branch_holds")
      .select("item_id")
      .or(`kind.eq.indefinite,unavailable_until.gt.${new Date().toISOString()}`),
  ]);
  const held = new Set((holds ?? []).map((hold) => hold.item_id));
  const expected = (items ?? []).filter(
    (item) =>
      item.is_active &&
      (item.menu_categories as unknown as { is_active: boolean }).is_active &&
      !held.has(item.id),
  ).length;

  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const available = page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Available/ });
  await expect(available.locator("span")).toHaveText(String(expected));

  await available.click();
  await expect(available).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("article")).toHaveCount(expected);
  await expect(page).toHaveURL(/status=available/);
  // The throwaway item is off the menu, so it is not available, and a search
  // for it inside this slice finds nothing rather than ignoring the chip.
  await expect(row(page)).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search the menu" }).fill(itemName);
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await expect(page).toHaveURL(/status=available/);
});

test("an item off the menu is never described as on sale", async ({ page }) => {
  // The throwaway item is off the menu. The list badges it so, and neither
  // the Availability panel nor the editor may then say it is selling.
  await page.goto(`${MENU}?q=${encodeURIComponent(itemName)}`, { waitUntil: "domcontentloaded" });
  await expect(row(page).getByText("Off the menu", { exact: true })).toBeVisible();
  await row(page).getByRole("button", { name: `Availability for ${itemName}` }).click();
  await expect(row(page).getByText(/is off the menu, so customers cannot order it at any counter/)).toBeVisible();

  await page.goto(`${MENU}/items/${itemId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("This item is off the menu, so no counter is selling it.", { exact: false })).toBeVisible();
  await expect(page.getByText(/This item is on sale at/)).toHaveCount(0);

  // And an item that is on, in a category that is on, with nothing held,
  // still reads as on sale. Only read, never changed.
  const db = serviceClient();
  const [{ data: onItems }, { data: holds }] = await Promise.all([
    db.from("menu_items").select("id, menu_categories!inner(is_active)").eq("is_active", true).eq("menu_categories.is_active", true),
    db.from("menu_item_branch_holds").select("item_id"),
  ]);
  const held = new Set((holds ?? []).map((hold) => hold.item_id));
  const onSale = (onItems ?? []).find((item) => !held.has(item.id));
  if (!onSale) test.skip(true, "needs an item on sale with nothing held");
  await page.goto(`${MENU}/items/${onSale!.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/This item is on sale at/)).toBeVisible();
  await expect(page.getByText(/is off the menu, so no counter is selling/)).toHaveCount(0);
});

test("a hold whose end has passed no longer reads as sold out", async ({ page }) => {
  const db = serviceClient();
  // Any branch, trading or not: whether a hold has run out is a question
  // about its clock alone, and no branch may be trading when this runs.
  const { data: branch, error: branchError } = await db
    .from("branches")
    .select("id")
    .order("sort_order")
    .limit(1)
    .single();
  if (branchError) throw new Error(`no branch to hold the item at: ${branchError.message}`);
  // Written straight to the table, because the hold RPC refuses an end in the
  // past. This is the row last night's "sold out for today" leaves behind. It
  // goes with the item in afterEach, by the cascade.
  const hold = { item_id: itemId!, branch_id: branch.id, kind: "today", reason: "out_of_stock" };
  const { error } = await db
    .from("menu_item_branch_holds")
    .insert({ ...hold, unavailable_until: new Date(Date.now() - 60 * 60_000).toISOString() });
  if (error) throw new Error(`could not plant the expired hold: ${error.message}`);

  await page.goto(`${MENU}?q=${encodeURIComponent(itemName)}`, { waitUntil: "domcontentloaded" });
  await expect(row(page)).toBeVisible();
  await expect(row(page).getByText("Sold out", { exact: true })).toHaveCount(0);
  const soldOut = page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Sold out/ });
  await expect(soldOut.locator("span")).toHaveText("0");

  // The same row with its end still ahead is sold out, so the test above is
  // about the clock and not about a badge that never draws.
  await db
    .from("menu_item_branch_holds")
    .update({ unavailable_until: new Date(Date.now() + 60 * 60_000).toISOString() })
    .eq("item_id", itemId!);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(row(page).getByText("Sold out", { exact: true })).toBeVisible();
  await expect(soldOut.locator("span")).toHaveText("1");
});

test("a search names each result's category, and says why an item is off", async ({ page }) => {
  // Read only. Rookie Burger and Rookie Burger Meal are the pair that got
  // mistaken for one another: one sold, one off waiting on a price.
  const { data: rookies } = await serviceClient()
    .from("menu_items")
    .select("name, is_active, pricing_note, menu_categories(name)")
    .ilike("name", "rookie%");
  const off = (rookies ?? []).find((item) => !item.is_active && item.pricing_note?.includes("Inactive until the owner confirms"));
  const on = (rookies ?? []).find((item) => item.is_active);
  if (!off || !on) test.skip(true, "needs the Rookie Burger and its switched off meal");
  const categoryOf = (item: typeof off) => (item!.menu_categories as unknown as { name: string }).name;

  await page.goto(`${MENU}?q=rookie`, { waitUntil: "domcontentloaded" });
  const offRow = page.locator("article").filter({ has: page.getByRole("heading", { name: off!.name, exact: true }) });
  const onRow = page.locator("article").filter({ has: page.getByRole("heading", { name: on!.name, exact: true }) });

  await expect(offRow.getByText(`in ${categoryOf(off)}`, { exact: true })).toBeVisible();
  await expect(onRow.getByText(`in ${categoryOf(on)}`, { exact: true })).toBeVisible();
  await expect(offRow.getByText("Waiting for the owner to confirm a pickup price.")).toBeVisible();
  await expect(onRow.getByText("Waiting for the owner to confirm a pickup price.")).toHaveCount(0);

  // Browsing without a search keeps the category to its heading.
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  await expect(offRow.getByText(`in ${categoryOf(off)}`, { exact: true })).toHaveCount(0);
  await expect(offRow.getByText("Waiting for the owner to confirm a pickup price.")).toBeVisible();
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
