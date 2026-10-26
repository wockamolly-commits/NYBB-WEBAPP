-- 0102_storefront_menu_hide_items_off_everywhere.sql
-- An item no counter sells must not be on the menu of a customer who has not
-- chosen a counter yet.
--
-- 0057 made a menu asked for no branch apply no holds at all, on the reasoning
-- that "the customer can still choose the branch that has the item". That is
-- right for an item held at SOME counters and wrong for an item held at ALL of
-- them: there is no branch that has it, so there is nothing for the customer
-- to choose.
--
-- It is what the owner saw. Marking an item unavailable at every counter took
-- it off the menu for anyone who had already picked a store, and left it on
-- /, /menu, the category and item pages and the cart for everybody else,
-- which is every first visit and every new browser or device, signed in or
-- not (the store choice is a cookie, not part of the account). Those
-- customers could build an order around it and only learn at checkout, where
-- place_order refused it with ITEM_UNAVAILABLE. On 2026-10-26 the live
-- database had Rainy Day Rush Bundle A and B held at all four trading
-- counters and both still listed by get_storefront_menu(null).
--
-- THE RULE NOW, FOR A NULL BRANCH.
-- ---------------------------------------------------------------------------
-- Show the item when at least one active branch can sell it right now. Hide it
-- when every active branch holds it. An item held at one counter of four still
-- shows, so 0057's intent survives intact; only the case 0057's reasoning did
-- not cover changes.
--
-- With no active branch at all the item still shows, which is 0051's rule:
-- with nothing trading there is no counter whose stock could be out. Hiding
-- the whole menu there would turn "not open yet" into "nothing to sell".
--
-- "Active" is branches.is_active, the same set the workspace's "Selling at"
-- control offers (tradingBranches in lib/staff/branch-availability.ts). That
-- is the set a person can mark an item off at, so it is the set whose holds
-- can add up to "off everywhere".
--
-- A NAMED BRANCH IS UNCHANGED, and so is place_order, which only ever
-- evaluates a real counter. The two readers still agree for every customer
-- who has chosen, and a customer who has not chosen can now only be offered
-- items at least one counter would accept.
--
-- Recreated whole because Postgres cannot patch a function body. Everything
-- below is copied verbatim from 0070 except the hold predicate in item_json
-- and the comment on the function, so the diff a reviewer reads is the
-- change. create or replace keeps the existing grants, including anon's
-- execute, which the public menu depends on.

create or replace function get_storefront_menu(p_branch_slug text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with list as (
  select resolve_price_list_id(p_branch_slug) as id
),

-- The branch whose holds apply, and null when the caller named no branch.
-- resolve_pickup_branch_id() is still the resolver for a slug that is
-- present, so this reader and place_order cannot disagree about which counter
-- a named customer is ordering from. An absent slug is now preserved as null
-- rather than resolved to the first active branch, and menu_item_is_available
-- returns true for a null branch, so a branch-less menu hides nothing.
branch as (
  select case
    when nullif(p_branch_slug, '') is null then null
    else resolve_pickup_branch_id(p_branch_slug)
  end as id
),

-- Variations, priced. A single-price item still has exactly one of these.
variation_json as (
  select
    iv.item_id,
    jsonb_agg(
      jsonb_build_object(
        'slug', iv.slug,
        'name', iv.label,
        'shortName', iv.short_label,
        'priceCents', resolve_variation_price_cents(iv.id, (select id from list))
      )
      order by iv.sort_order, iv.slug
    ) as variations
  from item_variations iv
  where iv.is_active
  group by iv.item_id
),

-- Options, per item, because an option's price can depend on which variation
-- of THIS item is chosen. The same Level of Hotness group attached to a second
-- item would resolve against that item's own variations.
option_rows as (
  select
    mig.item_id,
    mig.group_id,
    mo.sort_order,
    mo.slug,
    jsonb_strip_nulls(jsonb_build_object(
      'slug', mo.slug,
      'name', mo.name,
      -- The flavour's menu code (NY1 to NY10). Inside jsonb_strip_nulls on
      -- purpose: every option that is not a wing flavour has none, and the
      -- reader treats an absent key and a null the same way.
      'code', mo.code,
      'description', mo.description,
      'heatPercent', mo.heat_percent,
      -- Keyed on provenance, not on the URL. image_source is written by the
      -- seed; image_url is written later by the Storage ingest. Gating the
      -- whole object on the URL would drop the provenance in exactly the
      -- window where the reader needs it to find the local derivative, and
      -- every tile would render empty.
      'image', case
        when mo.image_url is null and mo.image_source is null then null
        else jsonb_build_object(
          'src', mo.image_url,
          'width', mo.image_width,
          'height', mo.image_height,
          'blurDataURL', mo.image_blur_data_url,
          'source', mo.image_source
        )
      end
    ))
    -- priceCents is merged in after the strip. Null is meaningful here: it
    -- states that this option has no flat price and the variation decides,
    -- which is not the same as the key being absent.
    || jsonb_build_object('priceCents', mo.price_cents)
    || jsonb_build_object(
      'variationPriceCents',
      coalesce(
        (
          select jsonb_object_agg(iv.slug, movp.price_cents)
          from menu_option_variation_prices movp
          join item_variations iv on iv.id = movp.variation_id
          where movp.option_id = mo.id
            and movp.price_list_id = (select id from list)
            and iv.item_id = mig.item_id
            and iv.is_active
        ),
        '{}'::jsonb
      )
    ) as option_object
  from menu_item_option_groups mig
  join menu_option_groups mog on mog.id = mig.group_id and mog.is_active
  join menu_options mo on mo.group_id = mog.id and mo.is_active
),

group_json as (
  select
    mig.item_id,
    jsonb_agg(
      jsonb_build_object(
        'slug', mog.slug,
        'name', mog.name,
        'minSelect', mig.min_select,
        'maxSelect', mig.max_select,
        'options', coalesce(
          (
            select jsonb_agg(o.option_object order by o.sort_order, o.slug)
            from option_rows o
            where o.item_id = mig.item_id
              and o.group_id = mig.group_id
          ),
          '[]'::jsonb
        )
      )
      order by mig.sort_order, mog.slug
    ) as option_groups
  from menu_item_option_groups mig
  join menu_option_groups mog on mog.id = mig.group_id and mog.is_active
  group by mig.item_id
),

item_json as (
  select
    mi.category_id,
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'slug', mi.slug,
        'name', mi.name,
        'code', mi.code,
        'description', mi.description,
        'categorySlug', mc.slug,
        'featured', mi.is_featured,
        -- See the note on the option image above: provenance travels even
        -- when the picture itself is not in Storage yet.
        'image', case
          when mi.image_url is null and mi.image_source is null then null
          else jsonb_build_object(
            'src', mi.image_url,
            'width', mi.image_width,
            'height', mi.image_height,
            'blurDataURL', mi.image_blur_data_url,
            'treatment', mi.image_treatment,
            'source', mi.image_source
          )
        end
      ))
      -- Arrays are appended after the strip so an item with no option groups
      -- keeps an empty array rather than losing the key. The reader would
      -- accept either; every consumer mapping over it would not.
      || jsonb_build_object(
        'variations', coalesce(v.variations, '[]'::jsonb),
        'optionGroups', coalesce(g.option_groups, '[]'::jsonb)
      )
      order by mi.sort_order, mi.slug
    ) as items
  from menu_items mi
  join menu_categories mc on mc.id = mi.category_id
  left join variation_json v on v.item_id = mi.id
  left join group_json g on g.item_id = mi.id
  where mi.is_active
    and case
      when (select id from branch) is not null then
        menu_item_is_available(mi.id, (select id from branch), now())
      -- No counter named: on the menu while any trading counter can sell it,
      -- and on it regardless when none is trading. See the header.
      else
        not exists (select 1 from branches b where b.is_active)
        or exists (
          select 1
          from branches b
          where b.is_active
            and menu_item_is_available(mi.id, b.id, now())
        )
    end
  group by mi.category_id, mc.slug
)

select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'slug', mc.slug,
      'name', mc.name,
      'blurb', coalesce(mc.blurb, ''),
      'items', coalesce(i.items, '[]'::jsonb)
    )
    order by mc.sort_order, mc.slug
  ),
  '[]'::jsonb
)
from menu_categories mc
left join item_json i on i.category_id = mc.id
where mc.is_active
  -- A category whose every item is inactive is not a section with nothing in
  -- it, it is a section that should not be on the board.
  and i.items is not null
$$;

comment on function get_storefront_menu(text) is
  'The whole public menu as one jsonb document, priced for the given branch. '
  'Shape matches lib/menu/types.ts exactly so the static Phase 0 catalog and '
  'this are interchangeable behind one reader. With no branch slug it prices '
  'against the active branch and hides only an item that every active branch '
  'holds: a customer who has not chosen a store sees everything some counter '
  'can sell, and nothing that no counter can.';
