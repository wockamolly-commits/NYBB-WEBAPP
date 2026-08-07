import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * A real Postgres to run the migrations against, in process.
 *
 * No Supabase project exists for this app yet, and the migrations must not be
 * applied to one when it does. PGlite is Postgres compiled to WebAssembly, so
 * the SQL in supabase/migrations is executed by the same parser, planner and
 * constraint machinery that will run it in production. A CHECK that does not
 * compile, a policy that names a missing function, a GRANT on the wrong
 * signature: all of it fails here rather than on the day of the demo.
 *
 * What it is not: Supabase. The auth schema, the anon / authenticated /
 * service_role roles and auth.uid() are shims created below, so these tests can
 * verify that policies and grants EXIST and are shaped correctly, but they
 * cannot prove what a live PostgREST request would return. Treat a green run
 * as "the schema is coherent", not as "RLS is proven".
 */

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const SEED = path.join(process.cwd(), "supabase", "seed.sql");

/**
 * The pieces Supabase provides that a bare Postgres does not.
 *
 * The default privileges lines are not decoration: they reproduce the Supabase
 * bootstrap grants. Without them, a revoke in the migrations would pass here
 * and fail to matter in production, which is the opposite of a useful test.
 *
 * The tables line came first and covers TRUNCATE, REFERENCES and TRIGGER on
 * every new table.
 *
 * **The functions line was missing until 0015, and its absence hid a real
 * hole for the whole of Phase 1.** Supabase also ships a default privilege
 * granting EXECUTE on functions to anon, authenticated and service_role, so
 * every function these migrations create arrived with an explicit `anon=X`
 * grant on it. 0010 and the Phase 1 migrations revoke EXECUTE `from public`,
 * which is the grantee Postgres uses by default but is NOT the grantee
 * Supabase had used, so the revoke removed a privilege nobody held and left
 * the real one untouched. In the first project this was ever applied to, anon
 * could execute all nineteen functions in `public`, including `rate_limit_hit`
 * and every price resolver.
 *
 * `tests/sql/place-order.test.ts` was already asserting the opposite, and
 * passing, because a bare Postgres has no such default. The test was right the
 * whole time; the database it ran against was the thing that was wrong. Do not
 * remove this line to make something go green.
 */
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  create or replace function auth.uid()
    returns uuid language sql stable as $$ select null::uuid $$;

  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;

  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;
`;

export async function migrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

/** A fresh database with 0001 to 0010 applied, and optionally the seed. */
export async function freshDatabase({ seed = false } = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);

  for (const file of await migrationFiles()) {
    const sql = await readFile(path.join(MIGRATIONS, file), "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }

  if (seed) await db.exec(await readSeed());
  return db;
}

export async function readSeed(): Promise<string> {
  return readFile(SEED, "utf8");
}

/** First column of the first row, which is what most of these assertions want. */
export async function scalar<T>(db: PGlite, sql: string): Promise<T> {
  const result = await db.query<Record<string, T>>(sql);
  const row = result.rows[0];
  return Object.values(row)[0];
}
