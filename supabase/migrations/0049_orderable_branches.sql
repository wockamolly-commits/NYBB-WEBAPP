-- 0049_orderable_branches.sql
-- Which counters a customer may choose to collect from.
--
-- WHY THIS FUNCTION HAS TO EXIST.
--
-- `branches` is RLS'd to staff (0009: "staff read branches"), which is right:
-- the table carries prep times, slot capacity and the accepting-orders switch,
-- and none of that is anonymous reading material. But it left the storefront
-- with no way to ask the one question a pickup-only shop is built around,
-- "where am I collecting from", so `get_pickup_slots(null)` quietly resolved
-- the first active branch by sort_order and the customer was never asked.
--
-- This is the read side of that question and nothing more. It returns the
-- branches that are live, the columns a picker has to draw, and the two
-- booleans that decide whether a card is selectable. It returns no capacity
-- figures, no staff assignments and no settings.
--
-- WHY IT DOES NOT RETURN THE INACTIVE EIGHT.
--
-- A branch with is_active = false is not a thing this platform can sell from,
-- so it is not this function's business. The nine physical counters are
-- published facts with published phone numbers and they live in
-- lib/catalog/branches.ts, where the contact page already reads them. The
-- storefront merges the two: the catalog says which shops exist, this says
-- which of them can take an order today. Returning the inactive rows here
-- would put the answer in two places and make an is_active flip a two-sided
-- change.
--
-- WHY isOpenNow IS SEPARATE FROM acceptsOrdersNow.
--
-- They fail differently and the customer needs to be told which. A branch that
-- is closed right now opens again later, and its slot grid may still have
-- windows inside the horizon, so it stays selectable. A branch with its
-- accepting-orders switch off is not taking anything at all today. Collapsing
-- both into one boolean is how a picker ends up telling somebody a shop is
-- shut when it is taking orders for the evening.

create or replace function get_orderable_branches(
  p_at timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slug', b.slug,
        'name', b.name,
        'shortName', b.short_name,
        'format', b.format::text,
        'addressLine', b.address_line,
        'city', b.city,
        'phones', to_jsonb(b.phones),
        'timezone', b.timezone,
        'slotMinutes', b.pickup_slot_minutes,
        'prepMinutes', b.prep_minutes_default,
        -- The same gate place_order will apply. A picker that offered a branch
        -- this returns false for would be offering an order the transaction
        -- refuses.
        'acceptsOrdersNow', branch_accepts_orders(b.id, p_at),
        'isOpenNow', branch_is_open_at(b.id, p_at)
      )
      order by b.sort_order, b.slug
    ),
    '[]'::jsonb
  )
  from branches b
  where b.is_active
$$;

comment on function get_orderable_branches(timestamptz) is
  'The branches a customer may choose to collect from: the active rows, with '
  'the two booleans that decide whether a store card is selectable. Reads no '
  'capacity and no settings beyond the accepting-orders gate. Merged in the '
  'storefront with lib/catalog/branches.ts, which is the published list of '
  'physical counters.';

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE to PUBLIC by default, so a SECURITY DEFINER function
-- without this pair is callable by any anonymous visitor with the definer's
-- privileges. Every function added after 0010 carries its own revoke in the
-- migration that creates it.
revoke execute on function get_orderable_branches(timestamptz) from public;

-- Anonymous, deliberately. A guest has to be able to choose a store before
-- there is any question of an account, and everything here is painted on the
-- shopfront: a name, a street, a phone number, and whether the door is open.
grant execute on function get_orderable_branches(timestamptz) to anon, authenticated;
