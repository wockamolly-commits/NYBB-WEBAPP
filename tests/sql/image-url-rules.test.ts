import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Migration 0101: an image address is one of this app's own Storage files,
 * and a placeholder is a small raster data URL, whoever writes the row.
 */

const GOOD = "https://ktltawglqblcqduavcre.supabase.co/storage/v1/object/public/menu-images/items/a1-900.webp";

describe("is_storage_image_url", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase();
  }, 120_000);

  const check = (url: string, bucket = "menu-images") =>
    db.query<{ ok: boolean }>("select is_storage_image_url($1, $2) as ok", [url, bucket]).then((r) => r.rows[0]!.ok);

  it("accepts this app's own Storage file", async () => {
    expect(await check(GOOD)).toBe(true);
  });

  it.each([
    ["another scheme", "javascript:alert(1)"],
    ["plain http", GOOD.replace("https:", "http:")],
    ["a host that is not Supabase", "https://evil.example.com/storage/v1/object/public/menu-images/a.webp"],
    ["a lookalike host", "https://x.supabase.co.evil.example/storage/v1/object/public/menu-images/a.webp"],
    ["the metadata address", "https://169.254.169.254/latest/meta-data"],
    ["another bucket", GOOD.replace("menu-images", "voucher-posters")],
    ["a climb out of the bucket", GOOD.replace("items/", "../private/")],
    ["a query string", `${GOOD}?x=1`],
    ["a fragment", `${GOOD}#x`],
    ["an encoded character", GOOD.replace("a1", "a%2e%2e")],
    ["a very long address", `${GOOD.slice(0, -5)}${"a".repeat(1100)}.webp`],
  ])("refuses %s", async (_label, url) => {
    expect(await check(url)).toBe(false);
  });
});

describe("the image columns", () => {
  let db: PGlite;
  let itemId: string;
  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    itemId = await scalar<string>(db, "select id::text from menu_items order by id limit 1");
  }, 120_000);

  it("refuses a menu photograph from another site, whoever writes it", async () => {
    await expect(
      db.query("update menu_items set image_url = 'https://evil.example.com/pixel.gif', image_width = 1, image_height = 1 where id = $1", [itemId]),
    ).rejects.toThrow(/menu_items_image_url_safe/);
  });

  it("refuses a placeholder that is not a raster data URL", async () => {
    for (const blur of ["https://evil.example.com/a.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html;base64,PGI+"]) {
      await expect(
        db.query("update menu_items set image_blur_data_url = $1 where id = $2", [blur, itemId]),
      ).rejects.toThrow(/menu_items_image_blur_safe/);
    }
  });

  it("takes the shape the upload path writes", async () => {
    await db.query(
      "update menu_items set image_url = $1, image_width = 900, image_height = 900, image_blur_data_url = 'data:image/webp;base64,UklGRg==' where id = $2",
      [GOOD, itemId],
    );
    expect(await scalar(db, `select image_url from menu_items where id = '${itemId}'`)).toBe(GOOD);
  });

  it("refuses a voucher poster from another bucket", async () => {
    await expect(
      db.query(
        `insert into vouchers (code, amount_cents, poster_url, poster_width, poster_height, poster_blur_data_url)
         values ('POSTER1', 100, $1, 10, 10, 'data:image/webp;base64,AA==')`,
        [GOOD],
      ),
    ).rejects.toThrow(/vouchers_poster_url_safe/);
  });
});
