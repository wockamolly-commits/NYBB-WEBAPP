# Standing rules for this project

## 1. This is NOT the Next.js you know

This project targets **Next.js 16**. It has breaking changes: APIs, conventions, and file structure
may all differ from your training data. Most notably, middleware is renamed to `proxy.ts`.

Before writing any code that touches routing, caching, Server Actions, `after()`, or image
handling, read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices. Do
not write Next 13/14/15 idioms from memory.

`npm run build` is part of the test loop, not just `tsc`. React Server Component boundary errors
appear only there. In particular, a `"use server"` file may only export `async` functions:
exporting a constant or a type from an actions file passes type-checking and unit tests, then fails
the build.

## 2. `C:\dev\zombeans-web` is a READ-ONLY reference

ZOMBEANS is a separate, live production system that this project inherits its architecture from.

- Read it freely and often. It is the answer to most "how should this work" questions.
- **Never write to it, never commit to it, never run its migrations, never start its dev server.**
- Inherit its *patterns*, not its content: server-authoritative pricing, RLS-first data access,
  flag-gated integrations, RPC-backed writes, idempotent checkout.
- Do not copy its brand, its copy, its colors, its zombie theming, its delivery subsystem, or its
  Loyverse integration. None of that transfers.

## 3. The implementation prompt is the spec

`docs/IMPLEMENTATION-PROMPT.md` is the full specification: architecture, data model, feature
classification, phases, and the open questions. Read it in full before starting work, and re-read
the relevant section before starting each phase. If reality contradicts it, say so and update the
document rather than silently diverging.

Section 28 lists questions only the business owner can answer. Do not invent answers to those.

## 4. Writing style

No em dashes anywhere: not in code comments, commit messages, documentation, or shipped UI copy.
Use commas, periods, or parentheses.

## 5. Asset archive

The verified image archive lives at `C:\dev\nybb-assets\` (100 files, 357 MB, `inventory.csv`
describes every one). Use it. **Do not fetch from `nybuffalobrads.com.ph`**: its TLS certificate
does not cover the apex domain, so standard fetching tools reject the host. The files are already
on disk.

Keep the archive out of this repository.

## 6. Empty is not zero

Zod's `z.coerce.number()` turns both an empty string and null into `0`, because that is what
JavaScript's `Number()` does. On a form field, empty means "the person left this blank". On a
database column, null means "this record has no value here". Neither of them means zero, and every
place this codebase stores an optional number, the difference is load bearing.

**The rule: coercion is only safe when a stray `0` would be rejected anyway.** A field whose valid
range starts at 1 is protected by its own bounds, because the accidental zero fails validation and
the person sees an error. A field whose valid range includes 0 has no such guard, and the accidental
zero is written as though somebody chose it.

This shipped once. `menu_options.heat_percent` used

```ts
z.union([z.coerce.number().int().min(0).max(100), z.literal("")])
```

A union takes the first member that parses, and the coercing member accepted `""` by turning it into
`0`, which passed `min(0)`. So `z.literal("")` was unreachable, "no heat level" was saved as "0%
heat" on every save, and the options screen opened a Heat % column across nine flavours that have
none. It passed lint, types, 900 unit tests and a production build; it was found by reading an audit
row weeks later.

When writing a schema for a value that may legitimately be absent:

- Put the empty branch first. `z.union([z.literal(""), z.coerce.number()...])`. Coercion is greedy,
  so a literal that shares its input has to be tried before it.
- Prefer `z.number().nullable()` over a coercion when reading a nullable column from Postgres, and
  branch on the null rather than letting it become a number. `z.coerce` is correct for a bigint
  column, which PostgREST returns as a string, but only where the column is `not null`.
- Keep the schema out of `"use server"` files. Those may only export async functions, so nothing
  beside them can be unit tested, and that is precisely why the bug above was invisible. Put it in
  `lib/` and test the parse. See `lib/staff/menu-schemas.ts` and
  `tests/unit/menu-option-schema.test.ts`.

Known columns where this still matters, none of them read by any code yet: `vouchers.amount_cents`
(null = a percentage voucher) and `vouchers.max_uses` (null = unlimited). See spec section 18.
