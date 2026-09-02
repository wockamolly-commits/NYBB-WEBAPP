import { expect, test } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * Ticking and unticking an item's option groups.
 *
 * The defect this stands for: ticking a group and pressing Save wrote the link
 * to the database and then drew the checkbox empty again. The person saw their
 * change undone, and only a reload showed that it had in fact been saved.
 *
 * The cause is React 19's automatic reset of a form that has a Server Action.
 * React keeps a controlled input's `defaultValue` in step with its `value`, so
 * the reset puts the same text back, but it never touches `defaultChecked`
 * after the first render (see updateInput in react-dom). A controlled checkbox
 * therefore resets to whatever it was when the page loaded, and the re-render
 * that follows cannot correct it, because the `checked` prop has not changed
 * and React only writes the property when it does.
 *
 * Both directions are checked below. An empty box that fills itself in is the
 * same bug as a ticked one that empties, and the mount time value decides
 * which one a given group gets.
 *
 * This suite creates the item it edits and deletes it afterwards, so it never
 * changes an item the business put on the menu.
 */

const ITEM_NAME_PREFIX = "E2E option groups";

let itemId: string | null = null;
let groupNames: { first: string; second: string } | null = null;

test.beforeAll(async () => {
  const { data, error } = await serviceClient()
    .from("menu_option_groups")
    .select("name")
    .order("sort_order")
    .limit(2);
  if (error) throw new Error(`could not read the option groups: ${error.message}`);
  if ((data ?? []).length < 2) test.skip(true, "this test needs two option groups to exist");
  groupNames = { first: data![0].name as string, second: data![1].name as string };
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
      slug: `e2e-option-groups-${stamp}`,
      name: `${ITEM_NAME_PREFIX} ${stamp}`,
      is_active: false,
      sort_order: 9999,
    })
    .select("id")
    .single();
  if (error) throw new Error(`could not create the test item: ${error.message}`);
  itemId = data.id;

  // Two active sizes, one of them the default. The editor refuses to save an
  // item with no size at all, so the first is what makes the Save button
  // usable; the second is what gives the default radio somewhere to move to.
  const { error: sizeError } = await serviceClient()
    .from("item_variations")
    .insert([
      {
        item_id: itemId,
        slug: `e2e-option-groups-${stamp}-regular`,
        label: "Regular",
        short_label: "REG",
        price_cents: 10_000,
        is_default: true,
        is_active: true,
        sort_order: 0,
      },
      {
        item_id: itemId,
        slug: `e2e-option-groups-${stamp}-large`,
        label: "Large",
        short_label: "LRG",
        price_cents: 15_000,
        is_default: false,
        is_active: true,
        sort_order: 1,
      },
    ]);
  if (sizeError) throw new Error(`could not create the test sizes: ${sizeError.message}`);
});

test.afterEach(async () => {
  if (!itemId) return;
  await serviceClient().from("menu_item_option_groups").delete().eq("item_id", itemId);
  await serviceClient().from("item_variations").delete().eq("item_id", itemId);
  await serviceClient().from("menu_items").delete().eq("id", itemId);
  itemId = null;
});

async function linkedGroupCount(): Promise<number> {
  const { data, error } = await serviceClient()
    .from("menu_item_option_groups")
    .select("group_id")
    .eq("item_id", itemId!);
  if (error) throw error;
  return (data ?? []).length;
}

test("a group ticked and saved stays ticked, without a reload", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const group = page.getByRole("checkbox", { name: new RegExp(groupNames!.second) });
  await expect(group).toBeEnabled();
  await group.check();

  await page.getByRole("button", { name: /Save item/ }).click();
  await expect(page.getByText("Item saved.")).toBeVisible();

  await expect(group, "the group the person just ticked should still read as ticked").toBeChecked();
  expect(await linkedGroupCount(), "the link should have been written").toBe(1);
});

test("a group unticked and saved stays unticked, without a reload", async ({ page }) => {
  const { data: group, error } = await serviceClient()
    .from("menu_option_groups")
    .select("id")
    .order("sort_order")
    .limit(1)
    .single();
  if (error) throw new Error(`could not read an option group: ${error.message}`);
  const { error: linkError } = await serviceClient()
    .from("menu_item_option_groups")
    .insert({ item_id: itemId, group_id: group.id, sort_order: 0 });
  if (linkError) throw new Error(`could not link the option group: ${linkError.message}`);

  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const checkbox = page.getByRole("checkbox", { name: new RegExp(groupNames!.first) });
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();

  await page.getByRole("button", { name: /Save item/ }).click();
  await expect(page.getByText("Item saved.")).toBeVisible();

  await expect(
    checkbox,
    "the group the person just unticked should still read as unticked",
  ).not.toBeChecked();
  expect(await linkedGroupCount(), "the link should have been removed").toBe(0);
});

test("Featured survives a save the same way", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const featured = page.getByRole("checkbox", { name: "Featured" });
  await featured.check();

  await page.getByRole("button", { name: /Save item/ }).click();
  await expect(page.getByText("Item saved.")).toBeVisible();

  await expect(featured).toBeChecked();
});

/**
 * The default size radio, which is the same defect wearing a different type.
 * A radio is a controlled input too, so the reset puts back whichever row was
 * default when the page loaded and the person watches their choice undo
 * itself.
 */
test("the default size moved and saved stays moved, without a reload", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const large = page.getByRole("radio", { name: /Default: Large/ });
  await expect(large).not.toBeChecked();
  await large.check();

  await page.getByRole("button", { name: /Save item/ }).click();
  await expect(page.getByText("Item saved.")).toBeVisible();

  await expect(large, "the size just made default should still read as default").toBeChecked();

  const { data } = await serviceClient()
    .from("item_variations")
    .select("label")
    .eq("item_id", itemId!)
    .eq("is_default", true);
  expect(data?.map((row) => row.label)).toEqual(["Large"]);
});
