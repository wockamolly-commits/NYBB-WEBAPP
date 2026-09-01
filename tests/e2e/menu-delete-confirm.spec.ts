import { expect, test } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * The delete confirmation.
 *
 * This replaced window.confirm, which meant the gate stopped being the
 * browser's and started being this project's: a control that has to open, hold
 * focus, dismiss three different ways, and only actually delete on the one
 * press that says so. Every one of those is a "the button is there but does
 * nothing" failure waiting to happen, and none of them is visible to
 * tests/unit, which has no DOM.
 *
 * The three ways out are each checked against the database, not against the
 * screen. A dialog that closes and deletes anyway looks exactly like a dialog
 * that closes.
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
});
