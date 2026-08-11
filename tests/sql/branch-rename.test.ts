import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";

describe("Central Bloc branch rename", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into price_lists (slug, name)
      values ('rename-test', 'Rename test');

      insert into branches (
        slug, name, short_name, format, price_list_id,
        address_line, city
      ) values (
        'garden-bloc',
        'Legacy branch name',
        'Legacy short name',
        'street',
        (select id from price_lists where slug = 'rename-test'),
        'Legacy address',
        'Cebu City'
      );
    `);

    const migration = await readFile(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "0028_rename_central_bloc_branch.sql",
      ),
      "utf8",
    );
    await db.exec(migration);
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it("renames an existing branch row without changing its identity", async () => {
    const result = await db.query<{
      slug: string;
      name: string;
      short_name: string;
      address_line: string;
    }>(`
      select slug, name, short_name, address_line
      from branches
      where slug = 'garden-bloc'
    `);

    expect(result.rows[0]).toEqual({
      slug: "garden-bloc",
      name: "NYBB Hot Wings, Central Bloc",
      short_name: "Central Bloc, IT Park",
      address_line: "Central Bloc, Cebu IT Park, Lahug",
    });
  });
});
