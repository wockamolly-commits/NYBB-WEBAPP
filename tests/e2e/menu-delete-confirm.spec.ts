import { expect, test } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * Deleting a menu item: the question it asks, and where it lands.
 *
 * TWO DEFECTS, ONE FLOW, SO ONE SPEC.
 *
 * The gate used to be window.confirm. Replacing it with the app's own dialog
 * meant the gate stopped being the browser's and started being this project's:
 * a control that has to open, hold focus, dismiss three different ways, and
 * only actually delete on the one press that says so. Every one of those is a
 * "the button is there but does nothing" failure waiting to happen.
 *
 * The landing was the second defect, and it outlived the first fix for it.
 * Deleting an item deleted the item and then showed the storefront's "You took
 * a wrong turn" page on the item's own address. The delete worked; only the
 * landing was wrong, which is the worst version of it, because nothing on
 * screen says the item is gone and the natural read is that the whole thing
 * failed. The item route is built from the row the delete removes, that route
 * re-renders inside the action's own response, notFound() fires, and the
 * editor unmounts before any effect of its own could navigate. The redirect
 * therefore comes from the server, where it does not need the component to
 * outlive its data.
 *
 * The two belong in one spec because they are one press. A test that confirms
 * the dialog but never looks at the address bar is how the 404 came back.
 *
 * The three ways out are each checked against the database, not against the
 * screen. A dialog that closes and deletes anyway looks exactly like a dialog
 * that closes.
 *
 * None of this is visible to tests/unit, which has no DOM.
 *
 * This suite creates the item it deletes and cleans up whatever survives.
 */

let itemId: string | null = null;
let itemName = "";

test.beforeEach(async () => {
  const { data: category, error: categoryError } = await serviceClient()
    .from("menu_categories")
    .select("id")
    .limit(1)
    .single();
  if (categoryError) throw new Error(`no category to hang a test item on: ${categoryError.message}`);

  const stamp = Date.now();
  itemName = `E2E confirm me ${stamp}`;
  const { data, error } = await serviceClient()
    .from("menu_items")
    .insert({
      category_id: category.id,
      slug: `e2e-confirm-${stamp}`,
      name: itemName,
      code: "E2E",
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

async function itemStillExists(): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("menu_items")
    .select("id")
    .eq("id", itemId!);
  if (error) throw error;
  return (data ?? []).length === 1;
}

test("asks in the app's own dialog, naming the record", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Delete item" }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("This cannot be undone");
  await expect(dialog, "the dialog should name the record, not just the action").toContainText(
    itemName,
  );
  await expect(dialog, "and the identifier that tells two similar records apart").toContainText(
    "E2E",
  );

  // The safe answer holds focus, so Enter cannot delete anything.
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
});

test("Escape closes it and deletes nothing", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Delete item" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("alertdialog")).toBeHidden();
  expect(await itemStillExists(), "Escape must not delete the item").toBe(true);
});

test("Cancel closes it and deletes nothing", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Delete item" }).click();

  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("alertdialog")).toBeHidden();
  expect(await itemStillExists(), "Cancel must not delete the item").toBe(true);
});

test("the dialog's own Delete is what actually deletes", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Delete item" }).click();

  await page.getByRole("alertdialog").getByRole("button", { name: "Delete item" }).click();

  await expect
    .poll(itemStillExists, { message: "the item should be gone", timeout: 20_000 })
    .toBe(false);

  // And it lands back on the menu. A delete that works and then shows the
  // storefront's 404 on the item's own address reads as a delete that failed,
  // which is the worst version of it.
  await expect(page).toHaveURL(/\/workspace\/menu$/, { timeout: 20_000 });
  await expect(page.getByText("You took a wrong turn", { exact: false })).toHaveCount(0);
});
