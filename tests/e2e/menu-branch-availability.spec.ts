import { expect, test } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * "Available at" on the item editor: taking one counter off an item and
 * putting it back.
 *
 * WHAT THIS STANDS FOR, AND WHY THE OTHER SUITES CANNOT SEE IT.
 * ================================================================
 * tests/sql/menu-availability-readers.test.ts proves the database half: a
 * hold hides the item at its own branch and nowhere else, and a branch-less
 * menu is not hidden from at all. tests/unit/branch-availability.test.ts
 * proves the decisions the section makes before it renders. Neither can see
 * the thing this feature actually has to do, which is that pressing a button
 * on one row changes that row and no other, and that the row reads back the
 * new state WITHOUT a reload.
 *
 * That last clause is the one with a history. A Server Action writes through
 * an RPC and the page it was pressed on is a Server Component reading the
 * managed menu, so the row only tells the truth again if the action
 * revalidates this route. refreshMenu() listed five workspace paths and not
 * /workspace/menu/items/[id], because until now nothing on that page wrote a
 * hold. The same class of defect as the option checkbox that reset itself:
 * the write lands, the screen says otherwise, and only a hard refresh agrees.
 *
 * It creates the item it edits and deletes it afterwards, per the README's
 * safer pattern, so it never touches an item the business put on the menu.
 * Holds hang off that item and go with it.
 */

const ITEM_NAME_PREFIX = "E2E branch availability";

let itemId: string | null = null;
let branchNames: string[] = [];

test.beforeAll(async () => {
  const { data, error } = await serviceClient()
    .from("branches")
    .select("short_name")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(`could not read the branches: ${error.message}`);
  branchNames = (data ?? []).map((branch) => branch.short_name as string);
  if (branchNames.length === 0) test.skip(true, "this test needs a branch that trades");
});

test.beforeEach(async () => {
  const { data: category, error: categoryError } = await serviceClient()
    .from("menu_categories")
    .select("id")
    .limit(1)
    .single();
  if (categoryError) throw new Error(`no category to hang a test item on: ${categoryError.message}`);

  const stamp = Date.now();
  const { data, error } = await serviceClient()
    .from("menu_items")
    .insert({
      category_id: category.id,
      slug: `e2e-branch-availability-${stamp}`,
      name: `${ITEM_NAME_PREFIX} ${stamp}`,
      // Off the menu everywhere, so a run that dies halfway leaves nothing a
      // customer could see.
      is_active: false,
      sort_order: 9999,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not create the test item: ${error.message}`);
  itemId = data.id;

  const { error: sizeError } = await serviceClient().from("item_variations").insert({
    item_id: itemId,
    slug: `e2e-branch-availability-${stamp}-regular`,
    label: "Regular",
    short_label: "REG",
    price_cents: 10_000,
    is_default: true,
    is_active: true,
    sort_order: 0,
  });
  if (sizeError) throw new Error(`could not create the test size: ${sizeError.message}`);
});

test.afterEach(async () => {
  if (!itemId) return;
  // Explicit rather than leaning on the cascade, so a change to the foreign
  // key cannot quietly start leaving hold rows behind.
  await serviceClient().from("menu_item_branch_holds").delete().eq("item_id", itemId);
  await serviceClient().from("item_variations").delete().eq("item_id", itemId);
  await serviceClient().from("menu_items").delete().eq("id", itemId);
  itemId = null;
});

async function holdRows(): Promise<Array<{ branch_id: string; kind: string }>> {
  const { data, error } = await serviceClient()
    .from("menu_item_branch_holds")
    .select("branch_id, kind")
    .eq("item_id", itemId!);
  if (error) throw error;
  return data ?? [];
}

test("lists every trading counter, and only those", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Available at", exact: true }),
  });
  await expect(section).toBeVisible();

  for (const name of branchNames) {
    await expect(section.getByText(name, { exact: true })).toBeVisible();
  }

  // A counter that has never opened has no answer to give, so it is not asked
  // about. Eight of the nine branch rows are in that state.
  const { data: shut } = await serviceClient()
    .from("branches")
    .select("short_name")
    .eq("is_active", false);
  for (const branch of shut ?? []) {
    await expect(section.getByText(branch.short_name as string, { exact: true })).toHaveCount(0);
  }
});

test("the global switch names its own scope and points at this section", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  // "On the menu" named no menu, so nothing told a person that the per
  // counter control existed. See DESIGN.md, The Control That Has A Twin
  // Names Its Own Scope Rule.
  await expect(page.getByText("Sell this item at all", { exact: true })).toBeVisible();
  await expect(page.getByText("On the menu", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/use Available at below/)).toBeVisible();
});

test("stops selling at one counter, and says so without a reload", async ({ page }) => {
  const first = branchNames[0]!;
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Available at", exact: true }),
  });
  await expect(section.getByText("Available", { exact: true }).first()).toBeVisible();

  await section.getByRole("button", { name: new RegExp(`Stop selling .* at ${first}`) }).click();

  // The row itself, with no page.reload(). This is the assertion the
  // revalidatePath on /workspace/menu/items/[id] exists for.
  await expect(section.getByText("Sold out until someone puts it back")).toBeVisible();

  // And the write really happened, as the kind this screen is supposed to
  // write. A timed hold set from here would expire on its own and put the
  // item back at a counter that was meant to stop selling it.
  const rows = await holdRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.kind).toBe("indefinite");
});

test("puts the counter back, and leaves no hold row behind", async ({ page }) => {
  const first = branchNames[0]!;
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Available at", exact: true }),
  });
  await section.getByRole("button", { name: new RegExp(`Stop selling .* at ${first}`) }).click();
  await expect(section.getByText("Sold out until someone puts it back")).toBeVisible();

  await section.getByRole("button", { name: new RegExp(`Put .* back on the menu at ${first}`) }).click();
  await expect(section.getByText("Available", { exact: true }).first()).toBeVisible();

  // Lifting deletes the row. There is deliberately no is_held boolean beside
  // the timestamp, per 0051, so an emptied table is the whole of "available".
  expect(await holdRows()).toHaveLength(0);
});
