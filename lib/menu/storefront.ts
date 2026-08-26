import { z } from "zod";
import { catalogImageBySource } from "@/lib/catalog/images";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { staticMenu } from "./static";
import type { MenuCategory, MenuImage, StorefrontMenu } from "./types";

/**
 * The one place the storefront gets a menu.
 *
 * Two sources, one shape. `get_storefront_menu()` when Supabase is configured,
 * the static catalog when it is not, and the caller cannot tell which it got
 * except by reading `source`.
 *
 * The fallback is deliberately narrow. It triggers on the environment being
 * absent, which is a known and detectable state (no project exists yet, and a
 * Vercel Preview scope can be missing the pair). It does NOT trigger on a
 * query that fails against a database that is really there: that is a
 * misconfiguration or an outage, and quietly serving a hardcoded price list
 * instead is how a customer gets charged last quarter's prices. Loud is right.
 */

/**
 * The image as the database can currently supply it.
 *
 * `image_url` and its dimensions stay null until scripts/ingest-legacy-images.ts
 * has uploaded to Storage, while `image_source` is written by the seed. So a
 * row can legitimately carry provenance and no picture, and the schema has to
 * accept that rather than rejecting the whole menu over it.
 */
const partialImageSchema = z
  .object({
    src: z.string().min(1).nullish(),
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
    blurDataURL: z.string().min(1).nullish(),
    treatment: z.string().nullish(),
    source: z.string().nullish(),
  })
  .nullish();

const optionSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  priceCents: z.number().int().nonnegative().nullable(),
  variationPriceCents: z.record(z.string(), z.number().int().nonnegative()),
  heatPercent: z.number().int().min(0).max(100).nullish(),
  image: partialImageSchema,
});

const categoriesSchema = z.array(
  z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    blurb: z.string(),
    items: z.array(
      z.object({
        slug: z.string().min(1),
        name: z.string().min(1),
        code: z.string().nullish(),
        description: z.string().nullish(),
        categorySlug: z.string().min(1),
        featured: z.boolean(),
        pricingNote: z.string().nullish(),
        image: partialImageSchema,
        variations: z
          .array(
            z.object({
              slug: z.string().min(1),
              name: z.string().min(1),
              shortName: z.string().min(1),
              priceCents: z.number().int().nonnegative(),
            }),
          )
          .min(1),
        optionGroups: z.array(
          z.object({
            slug: z.string().min(1),
            name: z.string().min(1),
            minSelect: z.number().int().nonnegative(),
            maxSelect: z.number().int().positive(),
            options: z.array(optionSchema),
          }),
        ),
      }),
    ),
  }),
);

type PartialImage = z.infer<typeof partialImageSchema>;

/**
 * Fill in a picture the database knows about but cannot serve yet.
 *
 * Falls back to the committed derivative that came from the same archive file.
 * Once the Storage ingest has run, `src` is populated and this returns the
 * database's own URL untouched, so the fallback retires itself.
 */
function resolveImage(image: PartialImage): MenuImage | null {
  if (image?.src && image.width && image.height && image.blurDataURL) {
    return {
      src: image.src,
      width: image.width,
      height: image.height,
      blurDataURL: image.blurDataURL,
      treatment: image.treatment,
      source: image.source,
    };
  }

  const local = catalogImageBySource(image?.source);
  if (!local) return null;

  return {
    src: local.src,
    width: local.width,
    height: local.height,
    blurDataURL: local.blurDataURL,
    treatment: local.treatment,
    source: local.source,
  };
}

function hydrate(categories: z.infer<typeof categoriesSchema>): MenuCategory[] {
  return categories.map((category) => ({
    slug: category.slug,
    name: category.name,
    blurb: category.blurb,
    items: category.items.map((item) => ({
      slug: item.slug,
      name: item.name,
      code: item.code ?? null,
      description: item.description ?? null,
      categorySlug: item.categorySlug,
      featured: item.featured,
      pricingNote: item.pricingNote ?? null,
      image: resolveImage(item.image),
      variations: item.variations,
      optionGroups: item.optionGroups.map((group) => ({
        slug: group.slug,
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        options: group.options.map((option) => ({
          slug: option.slug,
          name: option.name,
          description: option.description ?? null,
          priceCents: option.priceCents,
          variationPriceCents: option.variationPriceCents,
          heatPercent: option.heatPercent ?? null,
          image: resolveImage(option.image),
        })),
      })),
    })),
  }));
}

/**
 * The menu as one counter can currently serve it.
 *
 * `branchSlug` is the counter the customer chose, and it is not decoration.
 * The RPC gates availability on it: an item held at that branch is absent from
 * what comes back. Passing nothing resolves the active branch with the lowest
 * sort_order, which is right only while one branch trades. The day a second
 * one goes live, a no-slug call shows the first branch's availability to a
 * customer buying from the second, and `place_order` (which resolves the
 * branch from the slug in the checkout payload) then refuses an item the menu
 * had offered. Every buying surface therefore passes the chosen slug.
 *
 * Null is a real answer rather than a missing one, exactly as in
 * `selectedBranchSlug()`: nobody has chosen yet, so let the database resolve
 * the default. `generateStaticParams` passes nothing for the same reason from
 * the other direction, since it runs at build with no customer to ask.
 */
export async function getStorefrontMenu(
  branchSlug?: string | null,
): Promise<StorefrontMenu> {
  if (!supabaseConfigured()) {
    return { categories: staticMenu(), source: "static" };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_storefront_menu", {
    p_branch_slug: branchSlug ?? null,
  });

  if (error) {
    throw new Error(`get_storefront_menu failed: ${error.message}`);
  }

  return { categories: hydrate(categoriesSchema.parse(data)), source: "database" };
}

/** Exported for the tests, which exercise the parse without a database. */
export const menuPayloadSchema = categoriesSchema;
export const hydrateMenuPayload = hydrate;
