import { describe, expect, it } from "vitest";
import {
  MAX_LINES,
  MAX_QUANTITY,
  addLine,
  cartQuantity,
  emptyCart,
  lineHref,
  lineKey,
  removeLine,
  resolveCart,
  setLineQuantity,
  snapshotTotalCents,
} from "@/lib/cart/lines";
import { CART_STORAGE_KEY, readCart, writeCart } from "@/lib/cart/storage";
import type { Cart, CartLine } from "@/lib/cart/types";
import { unitPriceCents } from "@/lib/menu/line-pricing";
import { staticMenu } from "@/lib/menu/static";
import { findItem } from "@/lib/menu";
import type { MenuCategory, MenuItem } from "@/lib/menu/types";

const categories = staticMenu();
const wings = findItem(categories, "chicken-wings") as MenuItem;

/** A configured line, priced the way the configurator prices one. */
function wingLine(
  flavour: string,
  heat: string,
  variationSlug = "half",
  quantity = 1,
): CartLine {
  const optionSlugs = { "wing-flavour": [flavour], "level-of-hotness": [heat] };
  return {
    itemSlug: "chicken-wings",
    variationSlug,
    optionSlugs,
    quantity,
    unitPriceCents: unitPriceCents(wings, { variationSlug, optionSlugs }),
  };
}

const cartOf = (...lines: CartLine[]): Cart => ({ lines });

describe("lineKey", () => {
  it("does not care what order the options were picked in", () => {
    const picked = lineKey({
      itemSlug: "chicken-wings",
      variationSlug: "half",
      optionSlugs: { "level-of-hotness": ["hot"], "wing-flavour": ["classic-buffalo"] },
    });
    const listed = lineKey({
      itemSlug: "chicken-wings",
      variationSlug: "half",
      optionSlugs: { "wing-flavour": ["classic-buffalo"], "level-of-hotness": ["hot"] },
    });
    expect(picked).toBe(listed);
  });

  it("treats an empty group and an absent one as the same line", () => {
    const absent = lineKey({ itemSlug: "x", variationSlug: "y", optionSlugs: {} });
    const empty = lineKey({ itemSlug: "x", variationSlug: "y", optionSlugs: { sauce: [] } });
    expect(absent).toBe(empty);
  });

  it("separates the same wings at two sizes", () => {
    expect(lineKey(wingLine("classic-buffalo", "hot", "half"))).not.toBe(
      lineKey(wingLine("classic-buffalo", "hot", "full")),
    );
  });

  it("separates two flavours at the same size", () => {
    expect(lineKey(wingLine("classic-buffalo", "none"))).not.toBe(
      lineKey(wingLine("salted-egg", "none")),
    );
  });
});

describe("addLine", () => {
  it("merges an identical line rather than stacking a duplicate", () => {
    const first = addLine(emptyCart, wingLine("classic-buffalo", "hot", "half", 2));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = addLine(first.cart, wingLine("classic-buffalo", "hot", "half", 3));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.cart.lines).toHaveLength(1);
    expect(second.cart.lines[0].quantity).toBe(5);
  });

  it("keeps a different heat level as its own line", () => {
    const first = addLine(emptyCart, wingLine("classic-buffalo", "hot"));
    if (!first.ok) throw new Error("unreachable");
    const second = addLine(first.cart, wingLine("classic-buffalo", "insane"));
    if (!second.ok) throw new Error("unreachable");

    expect(second.cart.lines).toHaveLength(2);
  });

  it("lands on the ceiling rather than refusing when a merge overflows", () => {
    const first = addLine(emptyCart, wingLine("classic-buffalo", "hot", "half", MAX_QUANTITY));
    if (!first.ok) throw new Error("unreachable");
    const second = addLine(first.cart, wingLine("classic-buffalo", "hot", "half", 5));

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.cart.lines[0].quantity).toBe(MAX_QUANTITY);
  });

  it("refuses a new line past MAX_LINES, which is what customer_carts allows", () => {
    const lines = Array.from({ length: MAX_LINES }, (_unused, index) => ({
      ...wingLine("classic-buffalo", "none"),
      itemSlug: `filler-${index}`,
    }));

    const result = addLine(cartOf(...lines), wingLine("salted-egg", "none"));
    expect(result).toEqual({ ok: false, reason: "full" });
  });

  it("still merges into an existing line when the cart is full", () => {
    const lines = Array.from({ length: MAX_LINES }, (_unused, index) => ({
      ...wingLine("classic-buffalo", "none"),
      itemSlug: `filler-${index}`,
    }));

    const result = addLine(cartOf(...lines), { ...lines[0], quantity: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.lines[0].quantity).toBe(2);
  });

  it("clamps a quantity that arrived out of range", () => {
    const result = addLine(emptyCart, wingLine("classic-buffalo", "none", "half", 999));
    if (!result.ok) throw new Error("unreachable");
    expect(result.cart.lines[0].quantity).toBe(MAX_QUANTITY);
  });
});

describe("setLineQuantity and removeLine", () => {
  const line = wingLine("classic-buffalo", "hot");
  const cart = cartOf(line, wingLine("salted-egg", "none"));

  it("changes only the line it names", () => {
    const next = setLineQuantity(cart, lineKey(line), 4);
    expect(next.lines[0].quantity).toBe(4);
    expect(next.lines[1].quantity).toBe(1);
  });

  it("clamps rather than accepting a zero as a removal", () => {
    const next = setLineQuantity(cart, lineKey(line), 0);
    expect(next.lines).toHaveLength(2);
    expect(next.lines[0].quantity).toBe(1);
  });

  it("removes by key", () => {
    expect(removeLine(cart, lineKey(line)).lines).toHaveLength(1);
  });
});

describe("cartQuantity and snapshotTotalCents", () => {
  it("counts pieces, not lines", () => {
    const cart = cartOf(
      wingLine("classic-buffalo", "hot", "half", 2),
      wingLine("salted-egg", "none", "full", 1),
    );
    expect(cartQuantity(cart)).toBe(3);
  });

  it("totals the stored snapshots", () => {
    // PHP 359 each (329 plus 30 of heat on a half), twice.
    const cart = cartOf(wingLine("classic-buffalo", "hot", "half", 2));
    expect(snapshotTotalCents(cart)).toBe(71800);
  });
});

describe("resolveCart", () => {
  it("prices a line through line-pricing and leaves a correct cart alone", () => {
    const cart = cartOf(wingLine("classic-buffalo", "hot", "full", 2));
    const resolved = resolveCart(categories, cart);

    expect(resolved.lines).toHaveLength(1);
    expect(resolved.lines[0].unitPriceCents).toBe(56900);
    expect(resolved.lines[0].totalCents).toBe(113800);
    expect(resolved.subtotalCents).toBe(113800);
    expect(resolved.quantity).toBe(2);
    expect(resolved.corrected).toBeNull();
    expect(resolved.dropped).toHaveLength(0);
  });

  it("names the size and the options it matched", () => {
    const resolved = resolveCart(categories, cartOf(wingLine("salted-egg", "hot")));
    const [line] = resolved.lines;

    expect(line.categorySlug).toBe("chicken-wings");
    expect(line.variation.slug).toBe("half");
    expect(line.options.map(({ option }) => option.slug)).toEqual(["salted-egg", "hot"]);
  });

  it("drops a line whose item has left the menu, and says so", () => {
    const cart = cartOf({ ...wingLine("classic-buffalo", "none"), itemSlug: "gone" });
    const resolved = resolveCart(categories, cart);

    expect(resolved.lines).toHaveLength(0);
    expect(resolved.dropped).toEqual([
      { line: cart.lines[0], name: null, reason: "item" },
    ]);
    expect(resolved.corrected).toEqual({ lines: [] });
  });

  it("drops a line whose size has been retired, and can still name the item", () => {
    const cart = cartOf({ ...wingLine("classic-buffalo", "none"), variationSlug: "quarter" });
    const resolved = resolveCart(categories, cart);

    expect(resolved.dropped[0].reason).toBe("variation");
    expect(resolved.dropped[0].name).toBe(wings.name);
  });

  it("drops a line whose flavour has been taken off", () => {
    const cart = cartOf(wingLine("discontinued-flavour", "none"));
    const resolved = resolveCart(categories, cart);

    expect(resolved.dropped[0].reason).toBe("option");
  });

  it("drops a line that no longer satisfies a required group", () => {
    // Flavour is minSelect 1. A stored line with none of it is a line the
    // configurator could not produce today, whatever it meant when it was
    // saved.
    const cart = cartOf({
      ...wingLine("classic-buffalo", "none"),
      optionSlugs: { "level-of-hotness": ["hot"] },
    });
    const resolved = resolveCart(categories, cart);

    expect(resolved.dropped[0].reason).toBe("option");
  });

  it("keeps a line that simply skipped an optional group", () => {
    // Heat is minSelect 0, so no heat at all is a real order of wings.
    const cart = cartOf({
      ...wingLine("classic-buffalo", "none"),
      optionSlugs: { "wing-flavour": ["classic-buffalo"] },
      unitPriceCents: 32900,
    });
    const resolved = resolveCart(categories, cart);

    expect(resolved.dropped).toHaveLength(0);
    expect(resolved.lines[0].unitPriceCents).toBe(32900);
  });

  it("reprices a stale snapshot and hands back the corrected cart", () => {
    const stale = { ...wingLine("classic-buffalo", "hot", "half"), unitPriceCents: 100 };
    const resolved = resolveCart(categories, cartOf(stale));

    expect(resolved.lines[0].repriced).toBe(true);
    expect(resolved.lines[0].unitPriceCents).toBe(35900);
    expect(resolved.corrected?.lines[0].unitPriceCents).toBe(35900);
  });

  it("settles: resolving the corrected cart corrects nothing further", () => {
    const stale = { ...wingLine("classic-buffalo", "hot"), unitPriceCents: 100 };
    const once = resolveCart(categories, cartOf(stale));
    expect(once.corrected).not.toBeNull();

    const twice = resolveCart(categories, once.corrected as Cart);
    expect(twice.corrected).toBeNull();
  });

  it("keeps the good lines when one of them is dropped", () => {
    const good = wingLine("classic-buffalo", "hot");
    const cart = cartOf(good, { ...good, itemSlug: "gone" });
    const resolved = resolveCart(categories, cart);

    expect(resolved.lines).toHaveLength(1);
    expect(resolved.dropped).toHaveLength(1);
    expect(resolved.corrected).toEqual({ lines: [good] });
  });

  it("resolves an item that has no options at all", () => {
    const resolved = resolveCart(
      categories,
      cartOf({
        itemSlug: "ribs-original",
        variationSlug: "regular",
        optionSlugs: {},
        quantity: 1,
        unitPriceCents: 34900,
      }),
    );

    expect(resolved.lines).toHaveLength(1);
    expect(resolved.lines[0].totalCents).toBe(34900);
  });

  it("survives a menu with nothing in it", () => {
    const resolved = resolveCart([] as MenuCategory[], cartOf(wingLine("classic-buffalo", "none")));
    expect(resolved.lines).toHaveLength(0);
    expect(resolved.subtotalCents).toBe(0);
  });
});

describe("lineHref", () => {
  it("opens the item on the flavour that was chosen", () => {
    const resolved = resolveCart(categories, cartOf(wingLine("salted-egg", "hot")));
    expect(lineHref(resolved.lines[0])).toBe(
      "/menu/chicken-wings/chicken-wings?flavour=salted-egg",
    );
  });

  it("is the plain item page when nothing on the line carries a photograph", () => {
    const resolved = resolveCart(
      categories,
      cartOf({
        itemSlug: "ribs-original",
        variationSlug: "regular",
        optionSlugs: {},
        quantity: 1,
        unitPriceCents: 34900,
      }),
    );
    expect(lineHref(resolved.lines[0])).toBe("/menu/ribs/ribs-original");
  });
});

/** Enough of the Storage interface to exercise the reader and writer. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("cart storage", () => {
  it("round trips a cart", () => {
    const storage = fakeStorage();
    const cart = cartOf(wingLine("classic-buffalo", "hot", "half", 2));

    writeCart(storage, cart);
    expect(readCart(storage)).toEqual(cart);
  });

  it("is an empty cart when nothing has been stored", () => {
    expect(readCart(fakeStorage())).toEqual(emptyCart);
  });

  it("is an empty cart when storage is unavailable", () => {
    expect(readCart(null)).toEqual(emptyCart);
    expect(() => writeCart(null, emptyCart)).not.toThrow();
  });

  it("drops a stored value that is not JSON, and clears it", () => {
    const storage = fakeStorage({ [CART_STORAGE_KEY]: "{not json" });
    expect(readCart(storage)).toEqual(emptyCart);
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("drops a cart written by an older shape", () => {
    const storage = fakeStorage({
      [CART_STORAGE_KEY]: JSON.stringify({ version: 0, lines: [] }),
    });
    expect(readCart(storage)).toEqual(emptyCart);
  });

  it("drops a cart whose lines are the wrong shape", () => {
    const storage = fakeStorage({
      [CART_STORAGE_KEY]: JSON.stringify({
        version: 1,
        lines: [{ itemSlug: "chicken-wings", quantity: "two" }],
      }),
    });
    expect(readCart(storage)).toEqual(emptyCart);
  });

  it("clamps a quantity that was edited by hand", () => {
    const storage = fakeStorage({
      [CART_STORAGE_KEY]: JSON.stringify({
        version: 1,
        lines: [{ ...wingLine("classic-buffalo", "none"), quantity: 9999 }],
      }),
    });
    expect(readCart(storage).lines[0].quantity).toBe(MAX_QUANTITY);
  });

  it("caps a hand-written cart at MAX_LINES", () => {
    const storage = fakeStorage({
      [CART_STORAGE_KEY]: JSON.stringify({
        version: 1,
        lines: Array.from({ length: MAX_LINES + 20 }, () => wingLine("classic-buffalo", "none")),
      }),
    });
    expect(readCart(storage).lines).toHaveLength(MAX_LINES);
  });

  it("does not take the page down when storage throws", () => {
    const hostile: Storage = {
      ...fakeStorage(),
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readCart(hostile)).toEqual(emptyCart);
    expect(() => writeCart(hostile, cartOf(wingLine("classic-buffalo", "none")))).not.toThrow();
  });
});
