import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A tripwire on the wiring, in the same spirit as
 * tests/unit/content-security-policy.test.ts and tests/unit/push-triggers.test.ts:
 * a decision that has to stay made, checked at the source level because
 * nothing else in this environment can see it.
 *
 * WHAT BREAKS IF THIS IS ABSENT, AND WHY NO OTHER TEST CATCHES IT.
 *
 * `get_storefront_menu(p_branch_slug)` hides an item held at the branch it is
 * given, and `place_order` resolves the branch from the slug in the checkout
 * payload. tests/sql/menu-availability-readers.test.ts proves the database half
 * against two real branches. tests/unit/menu-reader.test.ts proves the reader
 * forwards whatever slug it is handed. Neither can see the thing that was
 * actually wrong: that no call site handed it one. The menu therefore gated on
 * whichever branch sorts first, and a customer who chose the second was shown
 * the first's availability and refused at the till.
 *
 * That is the defect Task 2 shipped once already. Reverting any one line below
 * to a bare `getStorefrontMenu()` brings it back, and without this file the
 * suite stays green while it does. No render test would help: these are async
 * Server Components reading cookies, and there is no staff session or applied
 * migration here to hold an item with.
 *
 * BOTH HALVES ARE PINNED ON PURPOSE. A slug reaching `generateStaticParams`
 * is the opposite fault and just as real: that function runs during
 * `next build`, where there is no customer and no cookie to read one from, so
 * a slug there is either meaningless or a build failure.
 */

const WHY =
  "The customer's chosen counter must reach get_storefront_menu, or the menu " +
  "gates availability on a different branch than place_order does. See the " +
  "header of tests/unit/menu-branch-call-sites.test.ts.";

const CALL = "getStorefrontMenu(";

/**
 * Source with comments removed.
 *
 * Required, not tidiness: `app/actions/reorder.ts` and `app/layout.tsx` both
 * discuss `getStorefrontMenu()` in prose, and a scan that counted those would
 * report an unslugged call that does not exist.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/**
 * The argument text of every `getStorefrontMenu(...)` call in `source`, in
 * order. An empty string means the call passes nothing.
 *
 * Deliberately line based rather than a parser. Every call in this codebase
 * fits on one line, and a call that stops fitting fails loudly below rather
 * than being silently misread as unslugged.
 */
function menuCalls(source: string, where: string): string[] {
  const args: string[] = [];

  for (let from = 0; ; ) {
    const at = source.indexOf(CALL, from);
    if (at === -1) return args;
    from = at + CALL.length;

    const lineEnd = source.indexOf("\n", from);
    const rest = (lineEnd === -1 ? source.slice(from) : source.slice(from, lineEnd)).trim();

    if (rest === "") {
      throw new Error(
        `${where}: a getStorefrontMenu call is split across lines, so this ` +
          `source level check cannot tell whether it passes a branch slug. ` +
          `Put the call back on one line, or teach this test to parse it. ` +
          `Do not delete the assertion. ${WHY}`,
      );
    }

    args.push(rest.startsWith(")") ? "" : rest);
  }
}

/** The text of one function, from its declaration to the next top level export. */
function bodyOf(source: string, declaration: string, path: string): string {
  const start = source.indexOf(declaration);
  expect(
    start,
    `${path} no longer contains "${declaration}". If it was renamed, update ` +
      `this test rather than dropping it. ${WHY}`,
  ).toBeGreaterThan(-1);

  const rest = source.slice(start + declaration.length);
  const next = rest.search(/\nexport /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every file under `app/` that calls the menu reader. */
function callerFiles(dir = "app"): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return callerFiles(path);
    if (!/\.tsx?$/.test(path)) return [];
    return menuCalls(code(path), path).length > 0 ? [path.replace(/\\/g, "/")] : [];
  });
}

/**
 * Every surface that names a specific item a customer can be sent to buy.
 *
 * Note that `/` is on this list. It takes no money, but it renders a
 * ProductTile per featured item and every tile links to an item page that
 * resolves against the chosen counter. A landing page reading the menu without
 * the slug advertises items that counter has held, and the tile lands on a
 * 404. "Does this page charge" is the wrong test; "does it name specific
 * purchasable items" is the right one.
 */
const BUYING_SURFACES = [
  "app/(marketing)/page.tsx",
  "app/(marketing)/menu/page.tsx",
  "app/(marketing)/menu/[category]/page.tsx",
  "app/(marketing)/menu/[category]/[item]/page.tsx",
  "app/(marketing)/cart/page.tsx",
  "app/(marketing)/checkout/page.tsx",
  "app/actions/reorder.ts",
];

/** The routes whose build time param enumeration must stay customer free. */
const STATIC_PARAM_ROUTES = [
  "app/(marketing)/menu/[category]/page.tsx",
  "app/(marketing)/menu/[category]/[item]/page.tsx",
];

const STATIC_PARAMS_DECL = "export async function generateStaticParams";

/**
 * The one caller that reads the menu and passes nothing on purpose.
 *
 * /about links only to /menu, never to an item page, so it names no specific
 * item a customer could be sent to and refused. It takes three counts from the
 * menu for one sentence, and holds attach to items rather than to options, so
 * those counts do not move between counters.
 */
const NON_SELLING = "app/(marketing)/about/page.tsx";

describe("which surfaces tell the menu reader the customer's counter", () => {
  it.each(BUYING_SURFACES)("%s passes the chosen branch slug", (path) => {
    const source = code(path);

    // generateStaticParams is held to the opposite rule below, so its calls
    // are removed before the request time ones are judged.
    const runtime = STATIC_PARAM_ROUTES.includes(path)
      ? source.replace(bodyOf(source, STATIC_PARAMS_DECL, path), "")
      : source;

    const calls = menuCalls(runtime, path);

    expect(
      calls.length,
      `${path} no longer calls getStorefrontMenu at request time. If this ` +
        `surface stopped reading the menu, remove it from BUYING_SURFACES ` +
        `with a note saying why. ${WHY}`,
    ).toBeGreaterThan(0);

    for (const argument of calls) {
      expect(
        argument,
        `${path} calls getStorefrontMenu() with no branch slug. Pass the ` +
          `counter this customer chose: selection.selected?.slug where the ` +
          `page already reads getStoreSelection(), otherwise ` +
          `await selectedBranchSlug(). ${WHY}`,
      ).not.toBe("");
    }
  });

  it.each(STATIC_PARAM_ROUTES)("%s keeps generateStaticParams customer free", (path) => {
    const body = bodyOf(code(path), STATIC_PARAMS_DECL, path);
    const calls = menuCalls(body, `${path} generateStaticParams`);

    expect(calls.length).toBeGreaterThan(0);

    for (const argument of calls) {
      expect(
        argument,
        `${path} passes "${argument}" to getStorefrontMenu inside ` +
          `generateStaticParams. That function runs during next build, where ` +
          `there is no customer and no cookie to read one from, so a branch ` +
          `slug there is meaningless at best and a build failure at worst. ` +
          `Its job is to enumerate the slugs that exist, not the ones one ` +
          `counter can serve today.`,
      ).toBe("");
    }

    // The safety net under the line above: an unenumerated slug still renders
    // on demand, so a category or item the owner creates in the Workspace is
    // reachable before the next deploy.
    expect(code(path)).toContain("export const dynamicParams = true");
  });

  it(`${NON_SELLING} deliberately passes nothing`, () => {
    const calls = menuCalls(code(NON_SELLING), NON_SELLING);

    expect(calls.length).toBeGreaterThan(0);
    for (const argument of calls) {
      expect(
        argument,
        `${NON_SELLING} now passes "${argument}" to getStorefrontMenu. That ` +
          `is not wrong so much as unpaid for: this page links only to /menu ` +
          `and names no item a customer can be refused, so it should not buy ` +
          `a round trip resolving a counter. If it has started linking to ` +
          `item pages, move it into BUYING_SURFACES instead.`,
      ).toBe("");
    }
  });

  /**
   * The assertion that survives somebody adding a screen. Every other test
   * here checks a list, and a list cannot notice a new page nobody added to
   * it: that is exactly how the original defect spread to twelve call sites.
   */
  it("knows about every caller under app/", () => {
    const known = [...BUYING_SURFACES, NON_SELLING].sort();
    const found = callerFiles().sort();

    const added = found.filter((path) => !known.includes(path));
    const gone = known.filter((path) => !found.includes(path));

    expect(
      found,
      `The set of files calling getStorefrontMenu has changed and this test ` +
        `was not told.
` +
        (added.length
          ? `New caller(s) no rule covers: ${added.join(", ")}. Decide which ` +
            `this is. If the surface names a specific item a customer can be ` +
            `sent to buy, it MUST pass the chosen branch slug and belongs in ` +
            `BUYING_SURFACES. If it only counts or links to /menu, it may ` +
            `pass nothing and belongs beside NON_SELLING with a note saying ` +
            `why.
`
          : "") +
        (gone.length
          ? `Caller(s) that stopped reading the menu: ${gone.join(", ")}. ` +
            `Remove them from the list above.
`
          : "") +
        `This assertion exists because every other check here reads a fixed ` +
        `list, and a list cannot notice a page nobody added to it. That is ` +
        `precisely how the original defect reached twelve call sites. ${WHY}`,
    ).toEqual(known);
  });
});
