# NYBB Order

Pickup-only ordering platform for **New York Buffalo Brad's Hot Wings** (Cebu, Philippines).

Built by inheriting the architecture of the ZOMBEANS ordering platform
(`C:\dev\zombeans-web`, read-only reference) on Next.js 16, Supabase, and Tailwind v4.

## Status

Phase 0, not started. No application code yet.

## Start here

1. `AGENTS.md` for the standing rules.
2. `docs/IMPLEMENTATION-PROMPT.md` for the full specification: architecture, data model, feature
   classification from ZOMBEANS, build phases, and open questions.

## What this replaces

`nybuffalobrads.com.ph` is a four-page WordPress brochure whose "Order Here" page links out to
Tablevibe and Foodpanda. The business currently owns no order data, no customer relationship, and
pays aggregator commission on every ticket. This platform makes the pickup channel first-party.

## Scope

- **Pickup only.** No delivery, no dine-in.
- **Single branch at launch**, multi-branch-ready schema (`branch_id` from migration one).
- **ZenPOS** integration via an adapter, with a working manual re-key fallback from day one.
- **Two payment rails** (pay at counter, PayMongo online prepay), both flag-gated, both off by
  default.

## External resources

| What | Where |
|---|---|
| Reference implementation | `C:\dev\zombeans-web` (read-only) |
| Verified image archive | `C:\dev\nybb-assets` (100 files, 357 MB, see `inventory.csv`) |
| Live site being replaced | `https://nybuffalobrads.com.ph` (TLS cert does not cover the apex domain) |

## Open questions

See section 28 of the implementation prompt. Two of them block Phase 1: the pilot branch with its
real weekday hours, and the kitchen's genuine throughput per fifteen minutes at peak.
