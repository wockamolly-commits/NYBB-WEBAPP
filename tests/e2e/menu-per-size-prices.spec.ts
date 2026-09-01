import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * The per size price grid, after it lost its five Save buttons.
 *
 * One button now saves every row, which moves two things that used to be
 * structural into code that has to be right: the grid works out which rows
 * actually changed and sends only those, and the action writes every row it
 * can rather than stopping at the first that fails. Neither is visible to
 * tests/unit, which has no DOM and no database.
 *
 * The assertions are about the rows the person did not touch as much as the
 * ones they did. A bulk save that quietly rewrites four untouched rows to save
 * one is the failure this shape invites, and on screen it looks identical to
 * one that does the right thing.
 *
 * This suite builds the item, its sizes and its option link, and takes all of
 * it back out afterwards.
 */

const HOTNESS_SLUG = "level-of-hotness";

let itemId: string | null = null;
let variationIds: string[] = [];
let optionIds: string[] = [];

test.beforeEach(async () => {
  const { data: category, error: categoryError } = await serviceClient()
    .from("menu_categories")
    .select("id")
    .limit(1)
    .single();
  if (categoryError) throw new Error(`no category to hang a test item on: ${categoryError.message}`);

  const { data: group, error: groupError } = await serviceClient()
    .from("menu_option_groups")
    .select("id")
    .eq("slug", HOTNESS_SLUG)
    .single();
  if (groupError) throw new Error(`no ${HOTNESS_SLUG} group to price against: ${groupError.message}`);

  // Only the options with no flat price appear in this grid at all.
  const { data: options, error: optionsError } = await serviceClient()
    .from("menu_options")
    .select("id, name")
    .eq("group_id", group.id)
    .is("price_cents", null)
    .order("sort_order");
  if (optionsError) throw new Error(`could not read the options: ${optionsError.message}`);
  if ((options ?? []).length < 2) test.skip(true, "this test needs two per size priced options");
  optionIds = options!.map((option) => option.id as string);

  const stamp = Date.now();
  const { data: item, error: itemError } = await serviceClient()
    .from("menu_items")
    .insert({
      category_id: category.id,
      slug: `e2e-prices-${stamp}`,
      name: `E2E prices ${stamp}`,
      is_active: false,
      sort_order: 9999,
    })
    .select("id")
    .single();
  if (itemError) throw new Error(`could not create the test item: ${itemError.message}`);
  itemId = item.id;

  const { data: sizes, error: sizeError } = await serviceClient()
    .from("item_variations")
    .insert([
      {
        item_id: itemId,
        slug: `e2e-prices-${stamp}-half`,
        label: "Half",
        short_label: "HALF",
        price_cents: 10_000,
        is_default: true,
        is_active: true,
        sort_order: 0,
      },
      {
        item_id: itemId,
        slug: `e2e-prices-${stamp}-full`,
        label: "Full",
        short_label: "FULL",
        price_cents: 18_000,
        is_default: false,
        is_active: true,
        sort_order: 1,
      },
    ])
    .select("id");
  if (sizeError) throw new Error(`could not create the test sizes: ${sizeError.message}`);
  variationIds = (sizes ?? []).map((size) => size.id as string);

  const { error: linkError } = await serviceClient()
    .from("menu_item_option_groups")
    .insert({ item_id: itemId, group_id: group.id, sort_order: 0 });
  if (linkError) throw new Error(`could not link the option group: ${linkError.message}`);
});

test.afterEach(async () => {
  if (variationIds.length) {
    await serviceClient()
      .from("menu_option_variation_prices")
      .delete()
      .in("variation_id", variationIds);
  }
  if (itemId) {
    await serviceClient().from("menu_item_option_groups").delete().eq("item_id", itemId);
    await serviceClient().from("item_variations").delete().eq("item_id", itemId);
    await serviceClient().from("menu_items").delete().eq("id", itemId);
  }
  itemId = null;
  variationIds = [];
  optionIds = [];
});

/** Every price row this item's sizes carry, as option id to variation id to cents. */
async function savedPrices(): Promise<Record<string, Record<string, number>>> {
  const { data, error } = await serviceClient()
    .from("menu_option_variation_prices")
    .select("option_id, variation_id, price_cents")
    .in("variation_id", variationIds);
  if (error) throw error;
  const out: Record<string, Record<string, number>> = {};
  for (const row of data ?? []) {
    const optionId = row.option_id as string;
    const forOption = out[optionId] ?? {};
    forOption[row.variation_id as string] = Number(row.price_cents);
    out[optionId] = forOption;
  }
  return out;
}

function grid(page: Page) {
  return page.locator("section").filter({ hasText: "Per size prices" }).last();
}

test("one button saves the whole grid, and only the rows that changed", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const section = grid(page);
  await expect(section).toBeVisible();
  await expect(
    section.getByRole("button"),
    "the section should offer one Save and nothing else",
  ).toHaveCount(1);

  const [first, second] = optionIds;
  const [half, full] = variationIds;

  await section.getByRole("spinbutton", { name: /, HALF$/ }).first().fill("30");
  await section.getByRole("spinbutton", { name: /, FULL$/ }).first().fill("40.50");

  await section.getByRole("button", { name: "Save prices" }).click();
  await expect(section.getByText("Prices saved.")).toBeVisible();

  const saved = await savedPrices();
  expect(saved[first!], "the row that was edited should be written").toEqual({
    [half!]: 3000,
    [full!]: 4050,
  });
  expect(saved[second!], "a row nobody touched should not be written at all").toBeUndefined();
});

test("pressing Save with nothing changed writes nothing and says so", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  const section = grid(page);

  await section.getByRole("button", { name: "Save prices" }).click();

  await expect(section.getByText("No price changes to save.")).toBeVisible();
  expect(await savedPrices()).toEqual({});
});

test("a price over the maximum is named, and holds the button until it is fixed", async ({
  page,
}) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  const section = grid(page);
  const halfInput = section.getByRole("spinbutton", { name: /, HALF$/ }).first();

  await halfInput.fill("200000");

  const save = section.getByRole("button", { name: "Save prices" });
  await expect(save).toBeDisabled();
  await expect(section.getByText(/over PHP 100,000/)).toBeVisible();

  await halfInput.fill("30");
  await expect(save).toBeEnabled();
});

test("a blank clears one saved price and leaves the other alone", async ({ page }) => {
  const [first] = optionIds;
  const [half, full] = variationIds;
  const { data: priceList, error: listError } = await serviceClient()
    .from("price_lists")
    .select("id")
    .limit(1)
    .single();
  if (listError) throw new Error(`no price list to write against: ${listError.message}`);

  const { error: seedError } = await serviceClient()
    .from("menu_option_variation_prices")
    .insert([
      { option_id: first, variation_id: half, price_list_id: priceList.id, price_cents: 3000 },
      { option_id: first, variation_id: full, price_list_id: priceList.id, price_cents: 4000 },
    ]);
  if (seedError) throw new Error(`could not seed the prices: ${seedError.message}`);

  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  const section = grid(page);

  const halfInput = section.getByRole("spinbutton", { name: /, HALF$/ }).first();
  await expect(halfInput).toHaveValue("30");
  await halfInput.fill("");

  await section.getByRole("button", { name: "Save prices" }).click();
  await expect(section.getByText("Prices saved.")).toBeVisible();

  expect(await savedPrices()).toEqual({ [first!]: { [full!]: 4000 } });
});
