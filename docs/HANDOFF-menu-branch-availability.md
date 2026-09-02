# Handoff: branch-specific menu item availability

Written 2026-09-01. Branch at the time: `fix/menu-item-option-checkbox-reset`.

Paste the prompt below into a fresh Claude Code session in `C:\dev\nybb-order`.

---

## The prompt

Yesterday we looked at making menu item availability branch-specific, so each
location can independently mark an item available or unavailable. The
investigation is done and a design is on the table but NOT yet approved. Pick
it up from there.

Read `docs/HANDOFF-menu-branch-availability.md` for the full findings, then
re-state the design in a few lines and ask me to approve or adjust it before
you write any code.

---

## What was already established (do not re-investigate)

**Branch-specific availability already exists and is live in the database.**
There are two distinct controls and they are easy to confuse:

| Control | Where | Scope |
|---|---|---|
| "On the menu" checkbox | Item editor, `app/(workspace)/workspace/menu/items/ItemEditor.tsx:431` | Every branch, by design |
| "Mark sold out" | Menu list, `app/(workspace)/workspace/menu/ItemHoldControl.tsx` | One counter only |

- The per-counter control writes `menu_item_branch_holds`, keyed
  `(item_id, branch_id)`. See `supabase/migrations/0051_menu_item_branch_holds.sql`,
  whose header comment explains why this is a table and not two columns on
  `menu_items`.
- `menu_item_is_available(item, branch, at)` is the single definition of
  available. Both `get_storefront_menu` and `place_order` call it
  (`supabase/migrations/0052_menu_availability_readers.sql:176` and `:551`).
- Migrations are live through **0056** (confirmed via the Supabase MCP with the
  explicit project ref `ktltawglqblcqduavcre`; `list_projects` does not show it).
- **`menu_item_branch_holds` is empty.** Nobody has used the per-counter control.
- **Only one branch is active**: `garden-bloc` / "Central Bloc, IT Park",
  `sort_order` 1. The other eight rows exist with `is_active = false`.

**The real bug found.** `get_storefront_menu(null)` resolves a missing branch
slug through `resolve_pickup_branch_id` (`supabase/migrations/0012_pickup_slots.sql:39`),
which returns the FIRST ACTIVE BRANCH rather than null. So the branch-less menu
at `/menu`, which every customer sees before choosing a store, applies that one
branch's sold-out holds to everyone. `0051`'s own comment states a null branch
was meant to hide nothing. Harmless today because only one branch trades; it
becomes a live cross-branch leak the moment a second one opens.

`/menu` reaches this state because `app/(marketing)/menu/page.tsx:43` calls
`getStorefrontMenu(selection.selected?.slug)`, which is `undefined` before the
customer has picked a store.

## The proposed design (awaiting approval)

**1. New migration `0057`.** Recreate `get_storefront_menu` whole (Postgres
cannot patch a function body), copying `0052` verbatim except the `branch` CTE:

```sql
branch as (
  select case
    when nullif(p_branch_slug, '') is null then null
    else resolve_pickup_branch_id(p_branch_slug)
  end as id
),
```

`menu_item_is_available` already returns true for a null branch, so a
branch-less menu then hides nothing. Do NOT touch `place_order`: its branch id
comes from the order payload, so it still refuses a held item at checkout and
there is no oversell window.

**2. Item editor gets the per-branch control.** Add an "Availability by branch"
section to `/workspace/menu/items/<id>` listing every active branch with its
current state and a set/lift control per row. `app/(workspace)/workspace/menu/items/[id]/page.tsx`
already loads the whole managed menu, so `menu.branches` and `item.holds` are
in hand; no new fetching. Gate it on `menu:availability` (the page itself
requires `menu:configure`).

Then reword the two controls so they cannot be mistaken for one another:
- global checkbox -> "Sell this item at all" (off = gone everywhere, indefinitely)
- new section -> "Available at" (per counter, independently)

**3. Explicitly out of scope.** Do NOT make `menu_items.is_active` per-branch.
The `indefinite` hold kind already means "not sold at this counter until
someone puts it back". A second per-branch boolean beside it is two ways to say
the same thing that can disagree, which `0051` was designed to avoid.

## Testing

- `tests/sql/menu-availability-readers.test.ts`: hold an item at branch A, then
  assert it is still in `get_storefront_menu(null)`, absent from
  `get_storefront_menu('a')`, present in `get_storefront_menu('b')`, and
  refused by `place_order` for A only.
- Unit test for the branch-list component's state rendering.
- Extend the existing menu e2e spec.
- `npm run build` is part of the loop, not just `tsc` (AGENTS.md rule 1).

## Open decisions for the user

1. Approve, adjust, or reject the design above.
2. Applying `0057` to the live database is a separate yes. Use the CLI with
   `SUPABASE_DB_URL` from `.env.local` (strip the wrapping single quotes or the
   CLI fails with `LegacyDbConfigParseUrlError`).
3. Nothing will look different in the running app while only one branch is
   active. Offer to switch a second branch on in staging temporarily so the
   behaviour is visible.

## Housekeeping

The working tree was dirty when this was written, from the earlier options-page
and save-button work on `fix/menu-item-option-checkbox-reset`. Check
`git status` and decide whether that lands first before starting here.
