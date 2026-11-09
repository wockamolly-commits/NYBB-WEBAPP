-- 0105_storefront_menu_sold_out_while_closed.sql
-- A sold out mark must not stop counting because the store is shut.
--
-- WHAT WAS SEEN. On 2026-10-26 NY Umbrella and both Rainy Day Rush bundles
-- were held, indefinitely, at the four counters then trading. Ninety minutes
-- later all four were paused and switched off (branches.is_active false), and
-- no counter has traded since. When 0103 switched the three items back on,
-- the workspace badged them Sold out and every public page listed them as
-- orderable: /, /menu, the category and item pages, and the cart.
--
-- WHY. Two rules, each reasonable alone, that together ignored every hold:
--
--   1. A named branch was resolved through resolve_pickup_branch_id(), which
--      returns only a trading branch. A customer whose chosen counter had
--      closed resolved to no branch, so that counter's holds were never read.
--   2. With no branch, 0102 kept 0051's rule that when nothing trades "there
--      is no counter whose stock could be out" and applied no holds at all.
--
-- So with every counter switched off, no hold could reach the menu, while the
-- workspace kept reading the same rows and calling the items sold out.
--
-- THE RULES NOW.
--   * A named branch applies its own holds, trading or not. Found by slug.
--   * No branch, some trading: unchanged from 0102. Hidden only when every
--     trading counter holds it.
--   * No branch, none trading: hidden when any counter holds it. Nobody can
--     order while every counter is closed (place_order raises NO_BRANCH), so
--     this hides nothing that could be bought, and it keeps the board from
--     advertising what the counters last said they could not sell. The moment
--     one counter trades again the rule above takes over.
--
-- place_order is unchanged. It already refuses a held item at the counter it
-- resolves and refuses to take an order with no trading counter at all, so it
-- never sold these items; it is the menu that disagreed with it.
--
-- Recreated whole because Postgres cannot patch a function body. Everything
-- is copied verbatim from 0102 except the branch lookup, the hold predicate
-- and the comment. create or replace keeps the existing grants, including
-- anon's execute, which the public menu depends on.

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

-- The branch whose holds apply, and null when the caller named no branch or
-- a slug that does not exist. Since 0105 a named branch is found whether or
-- not it is trading. For a trading branch that is the same row
-- resolve_pickup_branch_id() returns, so this reader and place_order still
-- agree about every counter that can take an order; for a closed one
-- place_order takes no order at all, and the menu now still honours that
-- counter's holds instead of forgetting them.
branch as (
  select case
    when nullif(p_branch_slug, '') is null then null
    -- By slug alone, trading or not. resolve_pickup_branch_id() only
    -- returns a trading branch, so a customer whose chosen counter had
    -- closed resolved to no branch at all and was shown none of its holds.
    else (select b.id from branches b where b.slug = p_branch_slug)
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
      -- No counter named, some trading: on the menu while any trading
      -- counter can sell it (0102).
      when exists (select 1 from branches b where b.is_active) then
        exists (
          select 1
          from branches b
          where b.is_active
            and menu_item_is_available(mi.id, b.id, now())
        )
      -- No counter named and none trading: a sold out mark anywhere stands.
      -- See the header of 0105.
      else
        not exists (
          select 1
          from menu_item_branch_holds h
          where h.item_id = mi.id
            and not menu_item_is_available(mi.id, h.branch_id, now())
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
  'this are interchangeable behind one reader. A named branch applies its own '
  'holds whether or not it is trading. With no branch slug it hides an item '
  'that every active branch holds, and, while no branch is active, an item '
  'held anywhere: a sold out mark is never ignored because the store is shut.';
