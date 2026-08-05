-- 0011_storefront_menu.sql
-- The storefront's read of the catalog: one function, one round trip, prices
-- already resolved.
--
-- Must land BEFORE the code that calls it. The menu pages fall back to the
-- static catalog when Supabase is unreachable, so shipping the reader first
-- would not break the site, it would quietly serve Phase 0 data forever.
--
-- The returned shape is lib/menu/types.ts one for one, in camelCase, because
-- the whole point of the exercise is that swapping the static catalog for this
-- is a change of source and not a change of shape. Prices are resolved in here
-- rather than in the reader for the same reason resolve_option_price_cents
-- exists at all: there is one definition of what a thing costs, in SQL, and
-- place_order will use the same one.

-- ---------------------------------------------------------------------------
-- Which price list applies.
-- ---------------------------------------------------------------------------
--
-- Prices hang off a price list, and a price list is reached through a branch.
-- That leaves a real gap today: the pilot branch is question 1 in spec section
-- 28, nobody has answered it, and every branch is therefore seeded
-- is_active = false. A menu with no branch still has to price itself.
--
-- The tempting answer is to pass a null price list down to the resolvers and
-- let them fall through to the default prices on item_variations. That is
-- wrong, and quietly so. resolve_variation_price_cents would indeed return the
-- published price, but resolve_option_price_cents would find no
-- menu_option_variation_prices row, fall through to menu_options.price_cents,
-- find NULL there (every Level of Hotness row above "No heat" is null on
-- purpose), and coalesce it to zero. The menu would render with heat free on
-- every wing size, and nothing would fail.
--
-- So the resolution is explicit and it raises rather than guessing:
--
--   1. the named branch's list, when a slug is given
--   2. the active branch's list, lowest sort_order first
--   3. the only price list, when exactly one exists
--   4. otherwise, an exception
--
-- Rule 3 is what carries the project until the pilot is chosen, and it stops
-- being reachable the moment a second list is created, which is exactly when
-- guessing would become dangerous.
create or replace function resolve_price_list_id(p_branch_slug text default null)
returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_price_list_id uuid;
begin
  if p_branch_slug is not null then
    select b.price_list_id into v_price_list_id
    from branches b
    where b.slug = p_branch_slug;

    if v_price_list_id is null then
      raise exception 'unknown branch slug: %', p_branch_slug
        using errcode = 'no_data_found';
    end if;

    return v_price_list_id;
  end if;

  select b.price_list_id into v_price_list_id
  from branches b
  where b.is_active
  order by b.sort_order, b.slug
  limit 1;

  if v_price_list_id is not null then
    return v_price_list_id;
  end if;

  select pl.id into v_price_list_id
  from price_lists pl
  where (select count(*) from price_lists) = 1;

  if v_price_list_id is null then
    raise exception
      'no price list resolvable: no branch is active and % price lists exist',
      (select count(*) from price_lists)
      using errcode = 'no_data_found';
  end if;

  return v_price_list_id;
end;
$$;

comment on function resolve_price_list_id(text) is
  'Which price list the storefront prices against. Raises rather than '
  'returning null: a null list makes the Level of Hotness add-on resolve to '
  'free, which is a silent mispricing rather than a visible failure.';

-- ---------------------------------------------------------------------------
-- The menu itself.
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER because anon holds no table privileges at all (0010). This
-- function plus get_public_settings, branch_is_open_at and
-- branch_accepts_orders are the entire anonymous read surface.
--
-- Inactive categories, items, variations, groups and options are filtered out
-- here rather than in the reader, so "sold out" and "hidden" mean the same
-- thing to every caller.
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
        'pricingNote', mi.pricing_note,
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
  'this are interchangeable behind one reader.';

-- ---------------------------------------------------------------------------
-- Grants, in the same migration that creates the functions, per 0010.
-- ---------------------------------------------------------------------------

revoke execute on function
  resolve_price_list_id(text),
  get_storefront_menu(text)
  from public;

-- resolve_price_list_id is internal. get_storefront_menu is SECURITY DEFINER,
-- so inside it the effective user is the owner and the call succeeds without
-- the caller ever holding EXECUTE on the helper.
grant execute on function get_storefront_menu(text) to anon, authenticated;
