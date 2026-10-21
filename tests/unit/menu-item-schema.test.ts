import { describe, expect, it } from "vitest";
import { itemSchema } from "@/lib/staff/menu-schemas";
import { pesosToCents } from "@/app/(workspace)/workspace/menu/items/sizeDrafts";

/**
 * The parse that decides whether a size can go on sale.
 *
 * The editor's pesos field reads a blank as 0, and staff_save_menu_item
 * accepts 0, so a size saved with its price left empty used to reach the
 * storefront at PHP 0 and be charged at PHP 0. These pin the refusal.
 */

const size = {
  id: "",
  label: "Half",
  shortLabel: "H",
  priceCents: 32900,
  isDefault: true,
  isActive: true,
};

function item(variations: Array<Record<string, unknown>>) {
  return {
    id: "",
    categoryId: "9ef2ac98-5e10-43a9-908b-e2cf3bc1079c",
    name: "Chicken",
    code: "",
    description: "",
    isFeatured: false,
    isActive: true,
    variations,
    optionGroupIds: [],
  };
}

describe("itemSchema size prices", () => {
  it("accepts a priced size", () => {
    expect(itemSchema.safeParse(item([size])).success).toBe(true);
  });

  it("refuses an active size whose price was left blank", () => {
    // The regression: a blank field becomes 0 on its way to the payload.
    const blank = { ...size, priceCents: pesosToCents("") };
    expect(blank.priceCents).toBe(0);
    expect(itemSchema.safeParse(item([blank])).success).toBe(false);
  });

  it("refuses an active size priced at an unreadable amount", () => {
    expect(itemSchema.safeParse(item([{ ...size, priceCents: pesosToCents("abc") }])).success).toBe(
      false,
    );
  });

  it("lets a removed size keep a zero price", () => {
    const removed = { ...size, isDefault: false, isActive: false, priceCents: 0 };
    expect(itemSchema.safeParse(item([size, removed])).success).toBe(true);
  });
});
