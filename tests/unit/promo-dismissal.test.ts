import { describe, expect, it } from "vitest";
import {
  MAX_REMEMBERED_DISMISSALS,
  isDismissed,
  parseDismissed,
  promoDismissalKey,
  serializeDismissed,
} from "@/lib/promos/dismissal";
import { promoRowSchema, type Promo } from "@/lib/promos/schema";

function promo(over: Partial<Record<string, unknown>> = {}): Promo {
  return promoRowSchema.parse({
    code: "LAUNCH50",
    description: null,
    amountCents: 5000,
    percentOff: null,
    maxDiscountCents: null,
    minOrderCents: 0,
    expiresAt: null,
    personal: false,
    itemNames: [],
    categoryNames: [],
    branchNames: [],
    ...over,
  });
}

describe("what counts as the same promo", () => {
  it("gives one promo a stable key", () => {
    expect(promoDismissalKey(promo())).toBe(promoDismissalKey(promo()));
  });

  it("gives two different codes different keys", () => {
    expect(promoDismissalKey(promo())).not.toBe(promoDismissalKey(promo({ code: "OTHER50" })));
  });

  it("treats a changed offer as a new message", () => {
    // An owner who edits a live promo's terms is making a different offer, and
    // somebody who dismissed the old wording has not seen the new one.
    expect(promoDismissalKey(promo())).not.toBe(
      promoDismissalKey(promo({ amountCents: 9900 })),
    );
    expect(promoDismissalKey(promo())).not.toBe(
      promoDismissalKey(promo({ minOrderCents: 50000 })),
    );
    expect(promoDismissalKey(promo())).not.toBe(
      promoDismissalKey(promo({ itemNames: ["Classic Buffalo"] })),
    );
  });

  it("does not resurface a promo because its description was reworded", () => {
    // The failure mode of resurfacing too eagerly is an advert somebody
    // already said no to, so the key follows the offer rather than the prose.
    expect(promoDismissalKey(promo({ description: "One" }))).toBe(
      promoDismissalKey(promo({ description: "Two" })),
    );
  });

  it("produces a key that is safe to put in a cookie unescaped", () => {
    // A code is owner-written and the database refuses only whitespace and
    // anything over 40 characters, so "SAVE!20%" is a legal code.
    for (const code of ["LAUNCH50", "SAVE!20%", "A-B_C", "X".repeat(40)]) {
      expect(promoDismissalKey(promo({ code }))).toMatch(/^[a-z0-9]{1,7}$/);
    }
  });
});

describe("reading the cookie", () => {
  it("is empty when there is no cookie", () => {
    expect(parseDismissed(undefined)).toEqual([]);
    expect(parseDismissed(null)).toEqual([]);
    expect(parseDismissed("")).toEqual([]);
  });

  it("reads back what it wrote", () => {
    const keys = [promoDismissalKey(promo()), promoDismissalKey(promo({ code: "OTHER50" }))];
    expect(parseDismissed(serializeDismissed(keys))).toEqual(keys);
  });

  it("drops junk rather than throwing on a page render", () => {
    // The honest failure for an unreadable list is to show the promo. A cookie
    // that threw would take the whole storefront layout down with it.
    expect(parseDismissed("not a key!; drop table")).toEqual([]);
    expect(parseDismissed("....")).toEqual([]);
  });

  it("keeps the good keys out of a partly corrupted cookie", () => {
    const good = promoDismissalKey(promo());
    expect(parseDismissed(`${good}.!!!!.`)).toEqual([good]);
  });

  it("refuses to grow without bound", () => {
    const many = Array.from({ length: MAX_REMEMBERED_DISMISSALS + 10 }, (_, i) =>
      promoDismissalKey(promo({ code: `CODE${i}` })),
    );
    expect(serializeDismissed(many).split(".")).toHaveLength(MAX_REMEMBERED_DISMISSALS);
    expect(parseDismissed(serializeDismissed(many))).toHaveLength(MAX_REMEMBERED_DISMISSALS);
  });

  it("keeps the newest dismissal when it has to forget one", () => {
    const newest = promoDismissalKey(promo({ code: "NEWEST" }));
    const rest = Array.from({ length: MAX_REMEMBERED_DISMISSALS + 5 }, (_, i) =>
      promoDismissalKey(promo({ code: `OLD${i}` })),
    );
    expect(parseDismissed(serializeDismissed([newest, ...rest]))).toContain(newest);
  });

  it("does not record the same dismissal twice", () => {
    const key = promoDismissalKey(promo());
    expect(serializeDismissed([key, key, key])).toBe(key);
  });
});

describe("deciding whether to draw the bar", () => {
  it("hides a promo this browser dismissed", () => {
    const dismissed = parseDismissed(serializeDismissed([promoDismissalKey(promo())]));
    expect(isDismissed(promo(), dismissed)).toBe(true);
  });

  it("shows a promo this browser has not seen", () => {
    const dismissed = parseDismissed(serializeDismissed([promoDismissalKey(promo())]));
    expect(isDismissed(promo({ code: "BRANDNEW" }), dismissed)).toBe(false);
  });

  it("shows a genuinely new promo even after a long run of dismissals", () => {
    const old = Array.from({ length: MAX_REMEMBERED_DISMISSALS }, (_, i) =>
      promoDismissalKey(promo({ code: `OLD${i}` })),
    );
    const dismissed = parseDismissed(serializeDismissed(old));
    expect(isDismissed(promo({ code: "BRANDNEW" }), dismissed)).toBe(false);
  });

  it("shows everything when the cookie is missing", () => {
    expect(isDismissed(promo(), parseDismissed(undefined))).toBe(false);
  });
});
