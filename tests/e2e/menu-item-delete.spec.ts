import { expect, test } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * Deleting a menu item.
 *
 * The defect this stands for: pressing Delete deleted the item and then put
 * the person on the storefront's 404 page. The item route is built from the
 * row that was just removed, it re-renders inside the action's own response,
 * and notFound() fired. The editor held an effect meant to send them back to
 * the menu, and it never got a turn, because notFound() had already unmounted
 * the component holding it. Nothing about that is visible to tests/unit, and
 * nothing about it is visible in the code either: the comments in actions.ts
 * and ItemEditor.tsx both described this exact failure as already prevented.
 *
 * This suite creates the item it deletes, so it never removes anything the
 * business put on the menu, and the row it makes is cleaned up whether the
 * test passes or fails.
 */

let itemId: string | null = null;

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
      slug: `e2e-delete-me-${stamp}`,
      name: `E2E delete me ${stamp}`,
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

test("deleting an item lands back on the menu, not on a 404", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  const del = page.getByRole("button", { name: /Delete item/ });
  await expect(del).toBeEnabled();

  await del.click();

  await expect(page).toHaveURL(/\/workspace\/menu$/, { timeout: 20000 });
  await expect(page.getByText("You took a wrong turn", { exact: false })).toHaveCount(0);

  const { data } = await serviceClient().from("menu_items").select("id").eq("id", itemId!);
  expect(data, "the item should be gone from the database").toEqual([]);
});
