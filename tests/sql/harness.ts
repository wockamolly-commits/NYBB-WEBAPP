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
 *
 * **The pgcrypto line is the second one of these, and it was missing until
 * 0016.** Supabase installs pgcrypto before the first migration runs, into the
 * `extensions` schema, so 0001's `create extension if not exists pgcrypto` is a
 * no-op there and gen_random_bytes is not on the `public` path that every
 * function in these migrations is pinned to. Here the extension was created by
 * that line, into `public`, so generate_pickup_code() resolved it and 38
 * place-order tests generated pickup codes that production could not. Creating
 * it into `extensions` first reproduces the real bootstrap and makes 0016 load
 * bearing. Do not move it back to `public` to make something go green.
 *
 * **The storage schema is the third of these, added for 0055.** Supabase's
 * Storage service owns storage.buckets and storage.objects and has RLS on the
 * latter, and a bucket policy is an ordinary policy on an ordinary table. Only
 * the columns the migrations actually name are here, which is enough to prove
 * that a policy compiles, targets the right role and calls a function that
 * exists. It proves nothing about what the Storage API would return, the same
 * caveat that applies to every policy in this file.
 */
const SUPABASE_SHIM = `
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;

  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;

  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email varchar(255)
  );
  create or replace function auth.uid()
    returns uuid language sql stable as $$ select null::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create schema if not exists realtime;
  create table realtime.sent_messages (
    payload jsonb not null,
    event text not null,
    topic text not null,
    private boolean not null
  );
  create or replace function realtime.send(
    payload jsonb,
    event text,
    topic text,
    private boolean
  ) returns void language sql as $$
    insert into realtime.sent_messages (payload, event, topic, private)
    values (payload, event, topic, private)
  $$;

  create schema if not exists storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text,
    owner uuid
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;

  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;

  alter default privileges in schema public
    grant execute on functions to anon, authenticated, service_role;

  alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;
`;

export async function migrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

/** A fresh database with every checked-in migration applied, optionally seeded. */
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
