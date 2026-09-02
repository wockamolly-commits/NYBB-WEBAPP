import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A tripwire on the wiring, in the same spirit as
 * tests/unit/menu-branch-call-sites.test.ts: a decision that has to stay made,
 * checked at the source level because nothing else in this environment can see
 * it.
 *
 * WHAT BREAKS IF THIS IS ABSENT, AND WHY NO OTHER TEST CATCHES IT.
 *
 * The menu catalog carries no branch. One list of items, categories, options
 * and prices serves all nine counters, so a manager pinned to one of them
 * editing it is editing every branch's menu. Migration 0059 and
 * resolvePermissions answer that by making menu:configure business wide: an
 * assigned profile does not get it from its job role, and holds it only
 * through an override the Super Admin sets by hand.
 *
 * That answer is only worth anything while every catalog surface actually
 * asks. tests/unit/staff-roles.test.ts proves the resolver drops the
 * permission. tests/sql/staff-business-wide-permissions.test.ts proves the
 * database agrees. Neither can see the thing that would actually go wrong:
 * a page relaxed from requireStaffPermission("menu:configure") to a bare
 * requireStaff(), or a new action shipped with the guard copied from
 * setMenuItemBranchAvailability. Either reopens the shared catalog to a branch
 * manager, and the whole suite stays green while it does, because no unit test
 * here can render an async Server Component and no SQL test can read a page.
 *
 * WHY THE GUARDS ARE LISTED PER ACTION RATHER THAN COUNTED. Exactly one export
 * in the actions file is deliberately NOT the catalog: marking an item sold out
 * at one counter is per branch, it is what a cashier does all shift, and it
 * gates on menu:availability. A count would let that one be pasted onto a
 * tenth action; naming it will not.
 */

const WHY =
  "The menu catalog is shared by every counter, so editing it is a business " +
  "wide act. See the header of tests/unit/catalog-permission-call-sites.test.ts.";

const MENU_DIR = "app/(workspace)/workspace/menu";
const ACTIONS = `${MENU_DIR}/actions.ts`;

/** Source with comments removed, so prose mentioning a permission is not read as a guard. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/**
 * The permission each catalog page requires, by path.
 *
 * The list page is the one that gates on menu:view: it is the screen a cashier
 * uses to mark an item sold out at their own counter, and it hides the catalog
 * controls behind hasStaffPermission rather than refusing the whole page.
 */
const PAGE_GATES: Record<string, string> = {
  [`${MENU_DIR}/page.tsx`]: "menu:view",
  [`${MENU_DIR}/categories/page.tsx`]: "menu:configure",
  [`${MENU_DIR}/options/page.tsx`]: "menu:configure",
  [`${MENU_DIR}/items/new/page.tsx`]: "menu:configure",
  [`${MENU_DIR}/items/[id]/page.tsx`]: "menu:configure",
};

/** The permission each exported action checks first. */
const ACTION_GUARDS: Record<string, string> = {
  setMenuItemBranchAvailability: "menu:availability",
  saveMenuCategory: "menu:configure",
  saveMenuOptionGroup: "menu:configure",
  saveMenuOption: "menu:configure",
  saveMenuItem: "menu:configure",
  setItemOptionVariationPrices: "menu:configure",
  deleteMenuEntity: "menu:configure",
  previewMenuImage: "menu:configure",
  uploadMenuItemImage: "menu:configure",
  uploadMenuOptionImage: "menu:configure",
};

/** Every page.tsx under the menu area, however deeply nested. */
function menuPages(dir = MENU_DIR): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return menuPages(path);
    return entry === "page.tsx" ? [path.split("\\").join("/")] : [];
  });
}

/** Each exported action, paired with the first permission it checks. */
function actionGuards(source: string): Record<string, string> {
  const found: Record<string, string> = {};
  const pattern =
    /export async function (\w+)[\s\S]*?hasStaffPermission\(profile, "([^"]+)"\)/g;
  for (const match of source.matchAll(pattern)) {
    found[match[1]!] = match[2]!;
  }
  return found;
}

describe("which catalog surfaces ask for the business wide permission", () => {
  it.each(Object.entries(PAGE_GATES))("%s requires %s", (path, permission) => {
    // Whitespace tolerant: the call is wrapped across lines wherever the page
    // keeps the returned profile, and a formatter deciding to wrap another one
    // is not a permission change.
    const gate = new RegExp(`requireStaffPermission\\(\\s*"${permission}"`);
    expect(
      code(path),
      `${path} no longer requires ${permission}. Relaxing a catalog page to ` +
        `requireStaff() reopens the shared menu to a branch manager. ${WHY}`,
    ).toMatch(gate);
  });

  it("knows about every page under the menu area", () => {
    // The assertion that survives somebody adding a screen. Every check above
    // reads a fixed list, and a list cannot notice a page nobody added to it.
    expect(
      menuPages().sort(),
      `The set of pages under ${MENU_DIR} has changed and this test was not ` +
        `told. Decide which the new one is: a screen that edits the shared ` +
        `catalog MUST call requireStaffPermission("menu:configure"), and a ` +
        `screen a cashier uses on their own counter gates on menu:view or ` +
        `menu:availability instead. Add it to PAGE_GATES either way rather ` +
        `than deleting this assertion. ${WHY}`,
    ).toEqual(Object.keys(PAGE_GATES).sort());
  });

  it("guards every exported action, and only one of them per counter", () => {
    expect(
      actionGuards(code(ACTIONS)),
      `The guards in ${ACTIONS} have changed. Every export that writes the ` +
        `shared catalog must check menu:configure. The single exception is ` +
        `setMenuItemBranchAvailability, which holds one item at one counter ` +
        `and is what a cashier does all shift. If a new action edits the ` +
        `catalog, guard it on menu:configure and name it here. ${WHY}`,
    ).toEqual(ACTION_GUARDS);
  });

  it("leaves no exported action without a guard", () => {
    const exported = [...code(ACTIONS).matchAll(/export async function (\w+)/g)].map(
      (match) => match[1]!,
    );
    expect(exported.sort(), `An export in ${ACTIONS} has no permission check. ${WHY}`).toEqual(
      Object.keys(ACTION_GUARDS).sort(),
    );
  });
});
