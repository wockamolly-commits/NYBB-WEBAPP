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
