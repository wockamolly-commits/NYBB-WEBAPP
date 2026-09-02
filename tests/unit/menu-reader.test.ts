import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStorefrontMenu, menuPayloadSchema } from "@/lib/menu/storefront";
import { staticMenu } from "@/lib/menu/static";
import { findItem, findOptionGroup } from "@/lib/menu";

/**
 * Only the client is faked, never the decision to use it.
 *
 * `supabaseConfigured` is reimplemented here rather than stubbed to a constant
 * because the first block below depends on the real answer: it deletes the
 * environment pair and asserts the static fallback. That is a two-line env
 * check in the real module, so restating it keeps both blocks in this file
 * driving the same rule, one with the pair absent and one with it present.
 */
const rpc = vi.fn();

vi.mock("@/lib/supabase/public-client", () => ({
  createPublicClient: () => ({ rpc }),
  supabaseConfigured: () =>
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
}));

describe("getStorefrontMenu without Supabase configured", () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  });

  it("serves the static catalog rather than failing the build", async () => {
    // The inherited trap: /menu is statically generated, so it reads the
    // database during `next build`. A Vercel Preview scope missing the
    // NEXT_PUBLIC_* pair must produce a working page, not a failed build and
    // not an empty store.
    const menu = await getStorefrontMenu();

    expect(menu.source).toBe("static");
    expect(menu.categories).toEqual(staticMenu());
    expect(menu.categories.length).toBeGreaterThan(0);
  });

  it("still carries the variation-dependent heat prices", async () => {
    const { categories } = await getStorefrontMenu();
    const wings = findItem(categories, "chicken-wings");
    const heat = findOptionGroup(wings, "level-of-hotness");
    const insane = heat?.options.find((option) => option.slug === "insane");

    expect(insane?.priceCents).toBeNull();
    expect(insane?.variationPriceCents).toEqual({ half: 4000, full: 6000 });
  });
});

/**
 * The plumbing this whole storefront-reads-the-chosen-branch change rests on.
 *
 * `get_storefront_menu` gates availability on the branch it is given, and
 * tests/sql/menu-availability-readers.test.ts already proves that against real
 * Postgres with two branches: an item held at "pilot" is absent for "pilot"
 * and present for "other". What that test cannot see is whether the web app
 * ever tells it which counter the customer chose. Until this change every call
 * site passed nothing, so the proven filter ran against the wrong branch.
 *
 * These two assertions pin the wire between the two.
 */
describe("which branch getStorefrontMenu asks about", () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (saved.key) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
    else delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("forwards the counter the customer chose", async () => {
    await getStorefrontMenu("sm-city-cebu");

    expect(rpc).toHaveBeenCalledWith("get_storefront_menu", {
      p_branch_slug: "sm-city-cebu",
    });
  });

  it("forwards null when nobody has chosen, rather than omitting the argument", async () => {
    // Null is the database's cue to resolve the default branch itself, and it
    // has to arrive as null: PostgREST would read a missing key as a missing
    // parameter, not as the documented "you pick".
    await getStorefrontMenu();
    expect(rpc).toHaveBeenCalledWith("get_storefront_menu", { p_branch_slug: null });

    rpc.mockClear();
    // What `selectedBranchSlug()` actually returns when the cookie names a
    // branch that has stopped trading, so the signature has to take it.
    await getStorefrontMenu(null);
    expect(rpc).toHaveBeenCalledWith("get_storefront_menu", { p_branch_slug: null });
  });
});

describe("the menu payload schema", () => {
  const validItem = {
    slug: "ribs-original",
    name: "Original Ribs",
    categorySlug: "ribs",
    featured: false,
    variations: [{ slug: "regular", name: "Regular", shortName: "REG", priceCents: 34900 }],
    optionGroups: [],
  };

  it("accepts a minimal well formed payload", () => {
    expect(() =>
      menuPayloadSchema.parse([
        { slug: "ribs", name: "Ribs", blurb: "", items: [validItem] },
      ]),
    ).not.toThrow();
  });

  it("rejects an item with no variations", () => {
    // A priceless item would render a tile with an empty price range, which
    // Math.min over an empty array turns into Infinity rather than an error.
    expect(() =>
      menuPayloadSchema.parse([
        { slug: "ribs", name: "Ribs", blurb: "", items: [{ ...validItem, variations: [] }] },
      ]),
    ).toThrow();
  });

  it("rejects a negative price", () => {
    expect(() =>
      menuPayloadSchema.parse([
        {
          slug: "ribs",
          name: "Ribs",
          blurb: "",
          items: [
            {
              ...validItem,
              variations: [{ ...validItem.variations[0], priceCents: -1 }],
            },
          ],
        },
      ]),
    ).toThrow();
  });

  it("keeps a null option price rather than coercing it", () => {
    const parsed = menuPayloadSchema.parse([
      {
        slug: "chicken-wings",
        name: "Chicken Wings",
        blurb: "",
        items: [
          {
            ...validItem,
            optionGroups: [
              {
                slug: "level-of-hotness",
                name: "Level of Hotness",
                minSelect: 0,
                maxSelect: 1,
                options: [
                  {
                    slug: "insane",
                    name: "Insane",
                    priceCents: null,
                    variationPriceCents: { regular: 4000 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(parsed[0].items[0].optionGroups[0].options[0].priceCents).toBeNull();
  });
});
