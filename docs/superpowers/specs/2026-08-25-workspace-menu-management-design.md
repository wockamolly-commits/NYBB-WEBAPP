# Menu management in the Workspace

Date: 2026-08-25
Status: approved in brainstorming, not yet implemented

## 1. Why

`menu:view`, `menu:availability` and `menu:configure` have been in
`lib/staff/roles.ts` since the roles file was written. A cashier resolves the
first two, a manager resolves all three, and the Workspace has no page behind
any of them. Nothing in this app can change a price, add an item, or mark the
wings sold out. The seed is the menu, and a developer with a migration is the
only way to edit it.

Spec section 8.3 classifies menu management CRUD and availability holds as
**keep as-is** from the reference, and section 27 puts them in Phase 4, whose
deliverable is "the owner can run the platform without a developer". This is
that work.

The reference implementation is
`C:\dev\zombeans-web\app\workspace\menu\` plus a 2,475 line
`components/admin/menu/MenuManager.tsx` and 811 lines of Server Actions. It
does categories, products with sizes, reusable option groups and their per item
links, availability holds with auto expiry, image upload with a zoom and offset
crop, deletes guarded against order history, and an audit row for every write.
That feature list transfers whole. Almost none of its implementation does, for
the four reasons in section 2.

## 2. Constraints this design accepts

- **Writes are RPCs, not table writes.** The reference uses a service role
  client and writes tables directly. Migration `0022` revoked `insert`,
  `update` and `delete` on every menu table from `authenticated` and says in
  its own header comment not to re-grant them to bring a form back in a hurry.
  Every write here goes through a `SECURITY DEFINER` function that resolves the
  permission with `current_staff_has_permission()` and records what changed,
  exactly as `0025` does for store availability.

- **Reads are plain selects.** `0022` revoked only the three write privileges.
  The `select` grant from `0010` survives, and the RLS policy on each menu table
  reads `current_staff_has_permission('menu:view')`. So the page reads the
  catalog with an ordinary staff client and the database enforces the
  permission. No service role client appears anywhere in this feature.

- **This catalog is richer than the reference's.** Branches point at price
  lists, and `menu_option_variation_prices` exists because heat costs PHP 30 on
  a half order of wings and PHP 40 on a full one. The reference prices an add-on
  as one number on the option row and has no equivalent table. Images here carry
  `image_width`, `image_height`, `image_blur_data_url`, `image_treatment` and
  `image_source`, not just a URL.

- **`menu_items` has no availability hold columns.** Only `is_active`. The hold
  is new work, not a port.

- **Migrations are frozen at 0050 and live.** `0051` through `0054` are written
  by this work and applied only when the owner says so.

- **The server prices everything.** Section 30. Nothing here sends, computes or
  restores a price the server did not give it. The page edits the numbers the
  server prices from; it never becomes a second pricing authority.

- **No branch is trading yet.** Central Bloc is the pilot and is still inactive
  pending its real hours. Everything here works against an inactive branch, and
  none of it depends on trading having started.

## 3. Decisions taken in brainstorming

Three questions were put to the owner and answered. They are recorded here
because each one closes a design fork that is otherwise reopened by anyone
reading the reference alongside this document.

### 3.1 Pricing scope: base prices and heat pricing, not the price list matrix

The page edits `item_variations.price_cents`, which is the default size price,
and `menu_option_variation_prices`, which is what each heat level costs on each
wing size. It does **not** offer a per price list override editor.

Exactly one price list exists (`hot-wings-standard`) and all nine branches point
at it. `resolve_price_list_id()` documents rule 3, "the only price list, when
exactly one exists", as the rule carrying the project until a second one is
created. An override UI built now would be a screen nobody can put a value into.

The consequence to accept: the day a second price list is created, this page
edits the base prices only and the override rows become invisible to it. That is
a known, deliberate gap and the trigger for a follow-up.

### 3.2 Availability holds are per branch

A hold is scoped to (item, branch). A Central Bloc cashier who runs out of wings
hides them at Central Bloc.

The reference is a single store and has no such concept: its
`unavailability_kind` and `unavailable_until` sit on the item row. Copying that
shape would mean one counter running out of wings hides them at every other
counter, and correcting it later is a migration plus a storefront change. `0002`
states the project's position on exactly this: the schema carries all nine
branches from day one so that opening the second is a boolean, not a migration.
A business wide hold column would break that promise for the first time.

It also splits the two permissions cleanly, which the single column cannot:

| Permission | Control | Meaning |
|---|---|---|
| `menu:configure` | `menu_items.is_active` | Off the menu everywhere, indefinitely. A manager decision. |
| `menu:availability` | `menu_item_branch_holds` | Paused at this counter, usually until tonight. A cashier decision mid shift. |

### 3.3 Photos are uploaded and cropped in the browser

Staff choose a photo, adjust zoom and vertical position against a live preview,
and the server crops, encodes and stores it. The alternative, an automatic
centred square crop with no control, was rejected: the archive pipeline in
`scripts/lib/image-pipeline.ts` already crops product shots to a centred square,
and a centred square is precisely what beheads a burger. The owner needs a way
to fix that without a developer, which is the phase deliverable.

## 4. Routes and permissions

One `Menu` item in the Workspace nav, shown to anyone with `menu:view`, leading
to four routes.

| Route | Permission | Contents |
|---|---|---|
| `/workspace/menu` | `menu:view` | Every item, grouped by category, with its status and its sold-out control. |
| `/workspace/menu/items/new` and `/items/[id]` | `menu:configure` | The item editor. |
| `/workspace/menu/categories` | `menu:configure` | Categories: name, blurb, order, active. |
| `/workspace/menu/options` | `menu:configure` | Option groups and their options. |

The reference renders one component for both audiences and disables what the
viewer cannot use. A cashier there gets a 2,475 line page whose every form is
greyed out. Here the split falls on the route: a cashier holds `menu:view` and
`menu:availability`, so `/workspace/menu` is a list whose only controls are the
sold-out controls, and the three configure routes are not linked for them and
redirect if reached.

`/workspace/availability` gains a link across to `/workspace/menu`, because the
counter status screen is where a cashier already is when the fryer backs up.

The four `requireStaffPermission()` calls are the boundary the user sees. They
are not the boundary that matters: every RPC in section 6 repeats the check, so
a redirect that failed to happen still cannot write.

## 5. What each screen does

### 5.1 The list, `/workspace/menu`

Items grouped by category in menu order. Each row carries its name, its code
where it has one, its size prices, whether it is featured, and its live state
across the branches the viewer can access.

The sold-out control is a small form per row, needing `menu:availability`. It
offers the reference's three durations, which are the right three: for the rest
of today, until a date and time you pick, or indefinitely. Where the viewer can
access more than one branch, it names the branch it is acting on.

Managers additionally see New item, Categories and Options.

### 5.2 The item editor, `/workspace/menu/items/[id]`

One form, one save, one audit row. It covers the item row, its variations and
its option group links together, because those three are a single editing
thought and three separate saves would leave an item half configured between
them.

Fields: category, name, code, description, featured, active, and the photo.

Sizes are a repeatable row of label, short label and price. `item_variations`
carries both `label` ("Half, 6 pieces") and `short_label` ("HALF"), and the
short one is what the kitchen ticket prints, so the form asks for both rather
than deriving one from the other. A single price item still gets exactly one
variation row, which is the rule `0003` states on the table itself.

Option groups are a multi select against the existing groups.

**The heat price grid.** `menu_option_variation_prices` is keyed on (option,
variation, price list), and a variation belongs to an item, so these rows are
inherently per item. For any linked group whose options carry a null
`price_cents`, the editor renders a grid: one row per option, one column per
size of this item. On wings that is five paid heat levels against Half and Full.
No heat has a flat price of 0 and stays out of the grid.

A null `price_cents` is not a missing price and the form must never treat it as
one. `0003` says so directly: `resolve_option_price_cents` falls through to zero
because the wing flavours and No heat are free choices. The grid's job is to
make the difference between "free" and "priced by size" visible.

### 5.3 Categories and options

Categories: name, blurb, sort order, active. `blurb` is one line under the
category header and the table comment calls it a description, not marketing
copy. The form says so.

Options: group name, description, active, and per option the name, description,
`heat_percent`, flat `price_cents` where it has one, and a photo. Heat percent
drives the heat meter on the storefront and is null for anything that is not
heat. Wing flavours carry their own photography, and the same upload used for
items serves them, because a flavour with no photo leaves a hole in the flavour
grid.

## 6. The write surface, migrations 0053 and 0054

Ten functions, each `SECURITY DEFINER`, each following the shape `0025`
established: resolve the permission, validate the input, take the row `for
update`, write, insert the audit row, return.

They land across four migrations rather than one, because
`staff_set_menu_item_hold` writes a table that does not exist until `0051`, and
because the two reader changes in 7.1 are the one part of this feature that
touches customer checkout and deserve their own reviewable file:

| Migration | Contents |
|---|---|
| `0051_menu_item_branch_holds.sql` | The holds table, `menu_item_is_available()`, `staff_set_menu_item_hold()`. |
| `0052_menu_availability_readers.sql` | `get_storefront_menu()` and `place_order()` gate on holds. |
| `0053_staff_menu_catalog_writes.sql` | Categories, option groups, options, reorder, deletes. |
| `0054_staff_menu_item_writes.sql` | Items with their variations and links, images, heat prices. |

| Function | Permission | Notes |
|---|---|---|
| `staff_save_menu_category` | `menu:configure` | Insert or update by null id. |
| `staff_save_menu_item` | `menu:configure` | Item, its variations and its option group links in one call. |
| `staff_set_menu_item_image` | `menu:configure` | All five image columns together. Called after the upload succeeds. |
| `staff_set_menu_option_image` | `menu:configure` | The same for a wing flavour. Six parameters, not seven: `menu_options` has no `image_treatment`. |
| `staff_save_menu_option_group` | `menu:configure` | |
| `staff_save_menu_option` | `menu:configure` | Including `heat_percent` and a nullable `price_cents`. |
| `staff_set_option_variation_prices` | `menu:configure` | The heat grid, one option's row at a time. |
| `staff_set_menu_item_hold` | `menu:availability` | Also checks `current_staff_can_access_branch()`. |
| `staff_delete_menu_entity` | `menu:configure` | The four entity kinds and their guards. |
| `staff_reorder_menu` | `menu:configure` | Sort order for categories, items and options. |

Slugs are generated from the name on insert and never regenerated on rename. A
slug is a URL a customer may have open, and `place_order` matches lines on it.

Deletes keep the reference's guards, which are the right ones and are worth
restating: a category with items refuses and asks you to move them; an item
referenced by `order_items` refuses and tells you to mark it unavailable
instead; an option referenced by `order_item_options` does the same; an option
group still linked to items refuses. Cart rows are temporary and are removed
ahead of the delete rather than blocking it.

A no-op writes no audit row, matching `staff_set_branch_accepting_orders`: an
entry saying a value was set to the value it already held describes nothing that
happened.

Errors are raised as the codes this codebase already uses (`FORBIDDEN`,
`BRANCH_FORBIDDEN`, `INVALID_INPUT`) and the Server Action maps them to
sentences, the way `app/(workspace)/workspace/availability/actions.ts` does.

## 7. Per branch holds, migrations 0051 and 0052

```sql
create table menu_item_branch_holds (
  item_id uuid not null references menu_items(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  kind text not null check (kind in ('today', 'until', 'indefinite')),
  unavailable_until timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, branch_id),
  constraint hold_has_an_end check (
    kind = 'indefinite' or unavailable_until is not null
  )
);
```

Lifting a hold deletes the row. There is no `is_held` boolean to fall out of
step with the timestamp beside it.

**One definition of available.** `menu_item_is_available(p_item_id, p_branch_id,
p_at)` is it, in the same way `branch_is_open_at()` is the only definition of
open. It returns false when a row exists for that pair and the hold has not
expired, and true otherwise. Nothing else compares `unavailable_until` to a
clock.

**Expiry is free.** The reference calls
`refresh_expired_menu_item_availability()` at the top of every menu management
page load to sweep rows whose hold has run out. Comparing `unavailable_until >
p_at` inside the function gets the same behaviour with no sweep, no cron and no
window in which an expired hold is still hiding an item. A periodic delete of
long expired rows is housekeeping, not correctness, and is out of scope.

### 7.1 Two readers change, not one

`get_storefront_menu(p_branch_slug)` already resolves a branch for pricing.
Availability follows the same resolution and the same function.

`place_order` gates too. Its section 7 carries this comment:

> The `is_active` filters here are the ones `get_storefront_menu` applies, on
> every level including the category. They have to be identical: a filter this
> function is missing sells something the menu is hiding, and one the menu is
> missing refuses something a customer can see.

A hold applied to only one of the two breaks that rule in the first direction: a
customer holding a page rendered before the hold could still buy sold-out wings,
and the counter would find out at the fryer. The gate goes next to the existing
item lookup and raises the existing `ITEM_UNAVAILABLE:<slug>` error, so the
checkout screen's error handling needs no new case.

This is the only part of this feature that touches the customer checkout path.
It gets its own SQL test.

## 8. Images

A Server Action receives the file, the zoom and the vertical offset. It reuses
the pipeline in `scripts/lib/image-pipeline.ts`: crop to the tile square, resize
to `TILE_WIDTH`, encode WebP, and render a 12 by 12 WebP as the blur
placeholder. `sharp` is already a dependency.

It writes all five image columns through `staff_set_menu_item_image`, or the
option's five through `staff_set_menu_option_image`. Writing `image_url` alone
renders a broken tile here, because `lib/menu/storefront.ts` expects width,
height and the placeholder alongside it.

The same component and the same processing serve both. A wing flavour's photo
drives the flavour grid and is what `previewImage()` swaps into the hero when a
customer picks one, so a flavour with no photo leaves a hole in two places.

Every upload lands at a fresh `randomUUID()` path. `next.config.ts` holds
optimized menu images for a year and its comment explains why that is safe: a
replacement always produces a new URL, so the old one is effectively immutable.
Overwriting in place would break that and must not be done.

A second Server Action returns a processed preview as a data URL so the zoom and
offset controls show the real crop rather than a CSS approximation.

Limits: 5 MB, and the decodable types the reference accepts.

### 8.1 A bucket mismatch to resolve first

`scripts/ingest-legacy-images.ts` writes to a bucket named `menu`.
`next.config.ts` permits `/storage/v1/object/public/menu-images/**` and nothing
else. One of those two is wrong today, and uploads have to land where
`next/image` will fetch them or every uploaded photo fails to optimize.

Establish which bucket actually holds the ingested images, make the upload path
and the remote pattern agree, and say in the implementation plan which of the
two files changed.

## 9. Storefront integration

`app/(marketing)/menu/[category]/page.tsx` and its `[item]` child both set
`dynamicParams = false`. A category or item created in the Workspace would 404
until somebody redeployed, which makes the page useless for the thing it exists
to do. Both become `dynamicParams = true`. `generateStaticParams` stays, so the
seeded menu is still prerendered at build; a new slug renders on demand instead
of 404ing.

The Server Actions then revalidate `/workspace/menu`, `/menu`,
`/menu/[category]` and `/menu/[category]/[item]`.

Holds do not need this treatment on the customer side beyond the revalidation,
because the availability filter lives in `get_storefront_menu` and the pages
call it on render.

## 10. Files

```
app/(workspace)/workspace/menu/
  page.tsx                     list, gated on menu:view
  actions.ts                   Server Actions, async exports only
  MenuList.tsx                 client, the list and its filters
  ItemHoldControl.tsx          client, the sold-out form
  categories/page.tsx
  categories/CategoryEditor.tsx
  options/page.tsx
  options/OptionGroupEditor.tsx
  items/ItemEditor.tsx         client, the form, shared by new and [id]
  items/ImageField.tsx         client, upload plus zoom and offset
  items/HeatPriceGrid.tsx      client, option by size prices
  items/new/page.tsx
  items/[id]/page.tsx

lib/staff/menu.ts              the read, assembled from eight selects
lib/staff/menu-types.ts        shared types, imported by client components

supabase/migrations/0051_menu_item_branch_holds.sql
supabase/migrations/0052_menu_availability_readers.sql
supabase/migrations/0053_staff_menu_catalog_writes.sql
supabase/migrations/0054_staff_menu_item_writes.sql
```

The reference's single 2,475 line component is not reproduced. The Workspace's
existing components are 89 and 135 lines (`AvailabilityManager.tsx`,
`SettingsManager.tsx`) and this feature stays inside that convention.

`actions.ts` exports async functions only. Per AGENTS rule 1, a `"use server"`
file that exports a constant or a type type-checks, passes unit tests and then
fails `npm run build`. Shared types live in `lib/staff/menu-types.ts`, which is
also what lets the client components import them.

## 11. Testing

**SQL, under `tests/sql/`, against a real database.** These are the tests that
matter, because the permission boundary is in the database:

- a cashier profile calling `staff_save_menu_item` raises `FORBIDDEN`;
- a cashier calling `staff_set_menu_item_hold` for their own branch succeeds and
  for another branch raises `BRANCH_FORBIDDEN`;
- `menu_item_is_available` returns false inside a hold and true after
  `unavailable_until` passes, with no sweep in between;
- `get_storefront_menu` omits a held item for the held branch and includes it
  for another;
- `place_order` raises `ITEM_UNAVAILABLE` for a held item at the ordering
  branch;
- each delete guard: category with items, item in an order, option in an order,
  group still linked;
- every successful write leaves exactly one audit row, and a no-op leaves none.

**Vitest units:** the read assembler in `lib/staff/menu.ts`, the Zod schemas,
and the slug generator.

**`npm run build`**, per AGENTS rule 1, since React Server Component boundary
errors appear only there.

## 12. Out of scope, named so nobody has to guess

- The per price list override editor. See 3.1.
- ZenPOS mapping. Section 16 of the implementation prompt, its own work. The
  reference's Loyverse settings block on its menu page does not come across, and
  neither do its payment type dropdowns.
- Bulk import or export of the menu.
- Reordering by drag. Sort order is a number field in this pass.
- Deleting long expired hold rows. See section 7.
- Any change to `get_order_by_tracking` or the order snapshot columns. A receipt
  keeps saying what was sold, and editing the menu must not rewrite history.
