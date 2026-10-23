import { describe, expect, it } from "vitest";
import {
  MAX_REMEMBERED_USED,
  hasUsed,
  parseUsed,
  promoUsedKey,
  serializeUsed,
  withoutUsed,
} from "@/lib/promos/used";

/**
 * The list of promo codes a browser has already spent.
 *
 * This replaced a dismissal cookie. Closing the bar is no longer remembered at
 * all, because a promo running today is worth saying again; what is remembered
 * is having taken the offer, because a spent promo is not an offer and
 * advertising it sends somebody to a checkout that refuses them over a cap they
 * had no way to see.
 */

describe("what counts as the same code", () => {
  it("gives one code a stable key", () => {
    expect(promoUsedKey("LAUNCH50")).toBe(promoUsedKey("LAUNCH50"));
  });

  it("ignores the case and the whitespace a customer typed", () => {
    // The database indexes upper(code) and the checkout field upper-cases on
    // the way in, so these are one code and have to be one key.
    expect(promoUsedKey(" launch50 ")).toBe(promoUsedKey("LAUNCH50"));
  });

  it("keeps two different codes apart", () => {
    expect(promoUsedKey("LAUNCH50")).not.toBe(promoUsedKey("LAUNCH51"));
  });

  it("does not change when the promo's wording changes", () => {
    // Keyed on the code alone, unlike the dismissal key it replaced. A
    // redemption happens against the voucher row, so rewording a code somebody
    // has already spent does not hand them a new use of it.
    expect(promoUsedKey("LAUNCH50")).toBe(promoUsedKey("LAUNCH50"));
  });

  it("is safe to put in a cookie unescaped", () => {
    // A code is owner-written and the database refuses only whitespace and
    // anything over 40 characters, so "SAVE!20%" is a legal code.
    for (const code of ["LAUNCH50", "SAVE!20%", "A-B_C", "X".repeat(40)]) {
      expect(promoUsedKey(code)).toMatch(/^[a-z0-9]{1,7}$/);
    }
  });
});

describe("reading the cookie", () => {
  it("is empty when there is none", () => {
    expect(parseUsed(undefined)).toEqual([]);
    expect(parseUsed(null)).toEqual([]);
    expect(parseUsed("")).toEqual([]);
  });

  it("reads back what it wrote", () => {
    const keys = [promoUsedKey("LAUNCH50"), promoUsedKey("OTHER50")];
    expect(parseUsed(serializeUsed(keys))).toEqual(keys);
  });

  it("drops junk rather than throwing during a page render", () => {
    // The honest failure for an unreadable list is to show the promo. A cookie
    // that threw would take the whole storefront layout down with it.
    expect(parseUsed("not a key!; drop table")).toEqual([]);
    expect(parseUsed("....")).toEqual([]);
  });

  it("keeps the good keys out of a partly corrupted cookie", () => {
    const good = promoUsedKey("LAUNCH50");
    expect(parseUsed(`${good}.!!!!.`)).toEqual([good]);
  });

  it("refuses to grow without bound", () => {
    const many = Array.from({ length: MAX_REMEMBERED_USED + 10 }, (_, i) =>
      promoUsedKey(`CODE${i}`),
    );
    expect(serializeUsed(many).split(".")).toHaveLength(MAX_REMEMBERED_USED);
    expect(parseUsed(serializeUsed(many))).toHaveLength(MAX_REMEMBERED_USED);
  });

  it("keeps the newest entry when it has to forget one", () => {
    const newest = promoUsedKey("NEWEST");
    const rest = Array.from({ length: MAX_REMEMBERED_USED + 5 }, (_, i) =>
      promoUsedKey(`OLD${i}`),
    );
    expect(parseUsed(serializeUsed([newest, ...rest]))).toContain(newest);
  });

  it("does not record the same code twice", () => {
    const key = promoUsedKey("LAUNCH50");
    expect(serializeUsed([key, key, key])).toBe(key);
  });
});

describe("deciding what to advertise", () => {
  const spent = parseUsed(serializeUsed([promoUsedKey("SPENT50")]));

  it("knows a code this browser has spent", () => {
    expect(hasUsed("SPENT50", spent)).toBe(true);
  });

  it("knows one it has not", () => {
    expect(hasUsed("FRESH50", spent)).toBe(false);
  });

  it("advertises everything when the cookie is missing", () => {
    expect(hasUsed("SPENT50", parseUsed(undefined))).toBe(false);
  });

  it("drops only the spent promos from a list", () => {
    const promos = [{ code: "SPENT50" }, { code: "FRESH50" }, { code: "ALSOFRESH" }];
    expect(withoutUsed(promos, spent).map((p) => p.code)).toEqual([
      "FRESH50",
      "ALSOFRESH",
    ]);
  });

  it("keeps the order the server put them in", () => {
    // The reader sorts soonest-to-expire first and the bar shows the first one,
    // so a filter that reordered would change which promo is announced.
    const promos = [{ code: "A" }, { code: "SPENT50" }, { code: "B" }];
    expect(withoutUsed(promos, spent).map((p) => p.code)).toEqual(["A", "B"]);
  });

  it("returns everything when nothing has been spent", () => {
    const promos = [{ code: "A" }, { code: "B" }];
    expect(withoutUsed(promos, [])).toHaveLength(2);
  });

  it("matches however the customer typed the code at checkout", () => {
    const lower = parseUsed(serializeUsed([promoUsedKey("launch50")]));
    expect(withoutUsed([{ code: "LAUNCH50" }], lower)).toEqual([]);
  });
});
