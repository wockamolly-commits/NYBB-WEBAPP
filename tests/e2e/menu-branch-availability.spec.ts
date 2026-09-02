import { expect, test, type Page } from "@playwright/test";
import { serviceClient } from "./fixtures/menu-photo";

/**
 * The one sold out control, on the menu list.
 *
 * WHAT THIS STANDS FOR, AND WHY THE OTHER SUITES CANNOT SEE IT.
 * ================================================================
 * tests/sql/menu-availability-readers.test.ts proves the database half: a
 * hold hides the item at its own branch and nowhere else, and a branch-less
 * menu is not hidden from at all. tests/unit/branch-availability.test.ts
 * proves the decisions the control makes before it renders. Neither can see
 * the thing this feature actually has to do, which is that ticking boxes and
 * pressing one Save changes exactly those counters and no others, and that
 * the rows read back the new state WITHOUT a reload.
 *
 * There used to be two controls, a cashier's here and an owner's on the item
 * editor. There is one now, on this screen, because a cashier holds
 * menu:availability and NOT menu:configure and cannot open the editor at all.
 * The second to last test is what stops a second control reappearing.
 *
 * The no-reload clause has a history. A Server Action writes through an RPC
 * and the page it was pressed on is a Server Component reading the managed
 * menu, so a row only tells the truth again if the action revalidates the
 * route. The same class of defect as the option checkbox that reset itself:
 * the write lands, the screen says otherwise, and only a hard refresh agrees.
 *
 * It creates the item it edits and deletes it afterwards, per the README's
 * safer pattern, so it never touches an item the business put on the menu.
 * Holds hang off that item and go with it.
 */

const MENU = "/workspace/menu";
const ITEM_NAME_PREFIX = "E2E branch availability";

let itemId: string | null = null;
let branchNames: string[] = [];

/** The card for the throwaway item, and the one control inside it. */
function card(page: Page) {
  return page.locator("article").filter({ hasText: ITEM_NAME_PREFIX });
}

/**
 * Picks a reason for one counter's row.
 *
 * By the select's own accessible name, which carries the counter. "Why" alone
 * is the column heading and would match every open row.
 */
async function chooseReason(item: ReturnType<typeof card>, branch: string, label: string) {
  await item.getByRole("combobox", { name: new RegExp(`Why .* at ${branch}$`) }).click();
  // The popup is portalled to the body, so it is not inside the card.
  await item.page().getByRole("option", { name: label, exact: true }).click();
}

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

async function holdRows(): Promise<Array<{ branch_id: string; kind: string; reason: string | null }>> {
  const { data, error } = await serviceClient()
    .from("menu_item_branch_holds")
    .select("branch_id, kind, reason")
    .eq("item_id", itemId!);
  if (error) throw error;
  return data ?? [];
}

test("shows one row per counter this person may act on", async ({ page }) => {
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const item = card(page);
  await expect(item).toBeVisible();

  for (const name of branchNames) {
    await expect(item.getByText(name, { exact: true })).toBeVisible();
  }

  // A counter that has never opened has no answer to give, so it is not
  // offered. Eight of the nine branch rows are in that state.
  const { data: shut } = await serviceClient()
    .from("branches")
    .select("short_name")
    .eq("is_active", false);
  for (const branch of shut ?? []) {
    await expect(item.getByText(branch.short_name as string, { exact: true })).toHaveCount(0);
  }
});

test("stops selling at a counter, and says so without a reload", async ({ page }) => {
  const first = branchNames[0]!;
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const item = card(page);
  const save = item.getByRole("button", { name: "Save availability" });

  // Nothing to commit yet, so the button is quiet and dead. A Save that is
  // pressable before anything changed writes a row nobody asked for.
  await expect(save).toBeDisabled();

  await item.getByRole("checkbox", { name: new RegExp(`Sell .* at ${first}`) }).uncheck();

  // Unticked but unexplained, so Save still will not press and says why. The
  // whole point of the reason is that it cannot be skipped.
  await expect(save).toBeDisabled();
  await expect(item.getByText(new RegExp(`Choose why ${first} is not selling it`))).toBeVisible();

  await chooseReason(item, first, "Equipment issue");
  await expect(save).toBeEnabled();
  await expect(item.getByText("1 counter changed.")).toBeVisible();

  // Still nothing written: the tick is a draft until Save.
  expect(await holdRows()).toHaveLength(0);

  await save.click();
  // The reason is part of the sentence now, which is the whole feature: the
  // state line says why, not only that.
  await expect(item.getByText(/sold out \(equipment issue\) until someone puts it back/i)).toBeVisible();

  const rows = await holdRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.kind).toBe("indefinite");
  expect(rows[0]?.reason).toBe("equipment");
});

test("the back on field appears only where it can apply", async ({ page }) => {
  const first = branchNames[0]!;
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const item = card(page);

  // A "comes back" beside a counter that IS selling the item is a field with
  // nothing to say. The old control showed it permanently, greyed out.
  //
  // Each field is labelled by its own counter's name, so two of them stack
  // without two identical labels, and "Back on" is the group's heading. That
  // is also what keeps the fields on one left edge.
  await expect(item.getByLabel("Back on")).toHaveCount(0);
  await item.getByRole("checkbox", { name: new RegExp(`Sell .* at ${first}$`) }).uncheck();
  await expect(item.getByLabel("Back on")).toBeVisible();

  // And the reason select opens with it, unchosen.
  await expect(item.getByRole("combobox", { name: new RegExp(`Why .* at ${first}$`) })).toBeVisible();
});

test("a counter's name stays on the line with its own tick box when the time opens", async ({
  page,
}) => {
  // The defect this stands for, and it shipped: the "back on" block lived
  // inside the tick box's own cell, so opening it made that cell ~120px tall.
  // The grid aligns cells to the bottom, so the counter's name and status sank
  // to the foot of the row while the box stayed at the top, leaving a lake of
  // empty charcoal between them. Two open rows read as a broken page.
  //
  // No assertion could see it: every other test here reads text and state, and
  // both were correct the whole time. This one reads geometry, the way the
  // options and categories layout specs do.
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const item = card(page);
  const first = branchNames[0]!;

  const box = item.getByRole("checkbox", { name: new RegExp(`Sell .* at ${first}$`) });
  await box.uncheck();
  await expect(item.getByLabel("Back on")).toBeVisible();
  // Nothing is saved here: the row's shape is the subject, so the reason the
  // Save would need is beside the point.

  const name = item.getByText(first, { exact: true }).first();
  const nameBox = await name.boundingBox();
  const tickBox = await box.boundingBox();
  if (!nameBox || !tickBox) throw new Error("could not measure the row");

  // Same line: their vertical centres within half a row of each other. It was
  // over 100px out before the fix.
  const nameCentre = nameBox.y + nameBox.height / 2;
  const tickCentre = tickBox.y + tickBox.height / 2;
  expect(Math.abs(nameCentre - tickCentre)).toBeLessThan(24);
});

test("writes a timed hold, and reads its end back rather than dropping it", async ({ page }) => {
  const first = branchNames[0]!;
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const item = card(page);

  await item.getByRole("checkbox", { name: new RegExp(`Sell .* at ${first}`) }).uncheck();
  await chooseReason(item, first, "Out of stock");
  await item.getByRole("button", { name: "Rest of today" }).click();
  await item.getByRole("button", { name: "Save availability" }).click();

  // The end is stored, and the kind records that the person chose "today"
  // rather than picking that instant by hand. 0051 keeps the two apart for
  // the audit trail, and this derivation is the only thing that writes it.
  // Case-insensitive on purpose. branchStatusLine prints the counter's name
  // first and lowers the sentence after it, "Central Bloc, IT Park: sold out
  // until ...", so a capital S here would pin a presentation detail rather
  // than the fact being asserted.
  await expect(item.getByText(/sold out \(out of stock\) until/i)).toBeVisible();
  const rows = await holdRows();
  expect(rows).toHaveLength(1);
  expect(rows[0]?.kind).toBe("today");
  expect(rows[0]?.reason).toBe("out_of_stock");

  // Reopened, the field carries the saved end rather than starting empty. An
  // empty field here would turn a timed hold into an indefinite one on the
  // next Save, which is a hold that has stopped expiring on its own.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(card(page).getByLabel("Back on")).not.toHaveValue("");

  // And Save with nothing touched writes nothing, so it is still dead.
  await expect(card(page).getByRole("button", { name: "Save availability" })).toBeDisabled();
});

test("puts a counter back by ticking it, and leaves no hold row behind", async ({ page }) => {
  const first = branchNames[0]!;
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const item = card(page);
  const box = item.getByRole("checkbox", { name: new RegExp(`Sell .* at ${first}`) });
  const save = item.getByRole("button", { name: "Save availability" });

  await box.uncheck();
  await chooseReason(item, first, "Ingredients unavailable");
  await save.click();
  await expect(item.getByText(/sold out \(ingredients unavailable\)/i)).toBeVisible();
  await expect(box).not.toBeChecked();

  await box.check();
  await save.click();

  // Wait for THIS row to stop saying it, not for any row to say "Available".
  // A second trading counter puts that word on screen before this save has
  // landed, so the obvious assertion passes instantly and the database read
  // below then runs mid-save. That is exactly how this test failed the first
  // time a second branch was switched on.
  await expect(item.getByText(/sold out \(/i)).toHaveCount(0);

  // Lifting deletes the row. There is deliberately no is_held boolean beside
  // the timestamp, per 0051, so an emptied table is the whole of "available".
  expect(await holdRows()).toHaveLength(0);
});

test("takes several counters off in one Save", async ({ page }) => {
  // The reason the per row buttons went. Skips itself while one branch trades.
  test.skip(branchNames.length < 2, "needs a second trading branch to be a multi-counter test");

  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  const item = card(page);
  for (const name of branchNames.slice(0, 2)) {
    await item.getByRole("checkbox", { name: new RegExp(`Sell .* at ${name}`) }).uncheck();
  }
  // Two counters off for two different reasons, which is the case a single
  // shared reason per save could not express.
  await chooseReason(item, branchNames[0]!, "Out of stock");
  await chooseReason(item, branchNames[1]!, "Equipment issue");
  await expect(item.getByText("2 counters changed.")).toBeVisible();

  await item.getByRole("button", { name: "Save availability" }).click();

  // Both rows, not `.first()`. The counters are written one RPC at a time, so
  // waiting for one of them to change lets the read below run while the
  // second is still in flight.
  await expect(item.getByText(/sold out \(/i)).toHaveCount(2);

  const rows = await holdRows();
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.reason).sort()).toEqual(["equipment", "out_of_stock"]);
});

test("the item editor points at the one control instead of carrying a second", async ({ page }) => {
  const first = branchNames[0]!;
  await page.goto(MENU, { waitUntil: "domcontentloaded" });
  await card(page).getByRole("checkbox", { name: new RegExp(`Sell .* at ${first}`) }).uncheck();
  await chooseReason(card(page), first, "Temporarily unavailable");
  await card(page).getByRole("button", { name: "Save availability" }).click();
  await expect(card(page).getByText(/sold out \(temporarily unavailable\)/i)).toBeVisible();

  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });

  // No second control here: the tick boxes are gone, and what remains is the
  // state in the same words plus the way back to where it is set.
  await expect(page.getByRole("heading", { name: "Available at", exact: true })).toHaveCount(0);
  // Anchored on the counter's name. An unanchored "Sell .* at" also matches
  // the global "Sell this item at all" box, which belongs here and stays.
  await expect(
    page.getByRole("checkbox", { name: new RegExp(`Sell .* at ${first}$`) }),
  ).toHaveCount(0);
  // The editor reads the reason back too, from the same function.
  await expect(
    page.getByText(`${first}: sold out (temporarily unavailable) until someone puts it back`),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the menu list" })).toBeVisible();
});

test("the global switch names its own scope and points at the menu list", async ({ page }) => {
  await page.goto(`/workspace/menu/items/${itemId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Sell this item at all", { exact: true })).toBeVisible();
  await expect(page.getByText("On the menu", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/mark it sold out from the menu list/)).toBeVisible();
});
