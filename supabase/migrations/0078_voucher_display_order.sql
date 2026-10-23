-- 0078_voucher_display_order.sql
--
-- The owner decides which promo leads.
--
-- Until now the storefront listed promos soonest-ending first, which is a
-- sensible default and a poor campaign tool: the promo the owner most wants
-- seen is rarely the one that happens to end soonest. This gives staff with
-- vouchers:manage an explicit order. The first ranked promo a customer can see
-- is the FEATURED one: it leads the promos page as a larger card, opens the
-- poster popup, fronts the promo bar, and heads the checkout suggestions,
-- because every one of those already reads list_customer_promos in order.
--
-- ONE CONCEPT, NOT TWO. "Listed first" and "featured" are the same decision,
-- so they are one column. A separate featured flag beside an order would allow
-- a featured promo listed third, which nobody could explain to a customer.
--
-- NULL IS "NOT PLACED", NEVER RANK ZERO. Unranked promos follow the ranked
-- ones in the old soonest-ending order, so a deployment where nobody has
-- touched the order behaves exactly as it did, with nothing featured. A null
-- here is an absence, per AGENTS.md rule 6.
--
-- WHY ITS OWN SETTER. The order is presentation, not a term, so like publicise
-- (0073) and the poster (0077) it stays changeable once a code is locked
-- (0067), and it never goes through admin_upsert_voucher.

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------

alter table vouchers
  add column if not exists display_priority integer;

alter table vouchers
  drop constraint if exists vouchers_display_priority_positive;
alter table vouchers
  add constraint vouchers_display_priority_positive
  check (display_priority is null or display_priority > 0);

-- ---------------------------------------------------------------------------
-- 2. Taking a code off the storefront takes it out of the order.
-- ---------------------------------------------------------------------------

-- Otherwise a code published again months later would come back carrying a
-- rank from a campaign nobody remembers and jump straight to featured. A
-- trigger rather than an edit to admin_set_voucher_publicise and the upsert,
-- because both write publicise and the rule has to hold for either.
create or replace function vouchers_clear_priority_when_hidden()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.publicise = false then
    new.display_priority := null;
  end if;
  return new;
end;
$$;

revoke execute on function vouchers_clear_priority_when_hidden()
  from public, anon, authenticated, service_role;

drop trigger if exists vouchers_clear_priority_when_hidden on vouchers;
create trigger vouchers_clear_priority_when_hidden
  before insert or update of publicise, display_priority on vouchers
  for each row execute function vouchers_clear_priority_when_hidden();

-- ---------------------------------------------------------------------------
-- 3. The setter.
-- ---------------------------------------------------------------------------

-- Takes the WHOLE order, first to last, and applies it in one statement: every
-- listed code gets its position, every other code goes back to unplaced. One
-- call is one consistent order, so two staff members reordering at once
-- cannot interleave into a list neither of them made. An empty array is
-- "back to automatic".
--
-- Only publicised codes may be placed. A rank on a code the storefront never
-- shows would be a setting with no effect, and the trigger above would clear
-- it anyway the next time anything touched the row.
create or replace function admin_set_voucher_order(p_voucher_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before   jsonb;
  v_ids      uuid[] := coalesce(p_voucher_ids, '{}'::uuid[]);
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if cardinality(v_ids) > 200
     or (select count(distinct id) from unnest(v_ids) as id) <> cardinality(v_ids)
     or exists (select 1 from unnest(v_ids) as id where id is null) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if (select count(*) from vouchers where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (select 1 from vouchers where id = any(v_ids) and not publicise) then
    raise exception 'NOT_PUBLICISED' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(code order by display_priority), '[]'::jsonb)
    into v_before
    from vouchers
   where display_priority is not null;

  -- Locked for the length of the statement, so a concurrent reorder waits
  -- rather than writing half its list between these two updates.
  perform 1 from vouchers where display_priority is not null or id = any(v_ids) for update;

  update vouchers set display_priority = null
   where display_priority is not null and not (id = any(v_ids));

  update vouchers v
     set display_priority = o.position
    from unnest(v_ids) with ordinality as o(id, position)
   where v.id = o.id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    case when cardinality(v_ids) = 0 then 'voucher.order_reset' else 'voucher.order_set' end,
    'vouchers',
    null,
    jsonb_build_object(
      'before', v_before,
      'after', (
        select coalesce(jsonb_agg(v.code order by o.position), '[]'::jsonb)
        from unnest(v_ids) with ordinality as o(id, position)
        join vouchers v on v.id = o.id
      )
    )
  );
end;
$$;

revoke execute on function admin_set_voucher_order(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function admin_set_voucher_order(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The listing, ordered by the owner first and saying what was placed.
-- ---------------------------------------------------------------------------

-- 0077's body with three changes and nothing else touched: the rank travels
-- as a sort key, the order puts ranked codes first (unranked keep the old
-- soonest-ending order after them), and each row says whether it was placed.
-- The featured promo is the first placed one the customer is finally shown,
-- decided by the storefront after its own filters (lib/promos/schema.ts,
-- featuredPromo): if the top code is spent or scoped away for this customer,
-- the next placed code they can actually use leads instead.

create or replace function list_customer_promos(p_branch_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_settings  app_settings%rowtype;
  v_branch_id uuid;
  v_user_id   uuid := auth.uid();
  v_now       timestamptz := now();
  v_rows      jsonb;
begin
  -- The flag is the authority, as it is in preview_voucher and place_order.
  -- An empty array rather than an error: a caller learns nothing, not even
  -- that the feature exists, which is the same posture the reference takes
  -- when its switch is off. It also means the storefront never reads the flag
  -- separately, so there is one place it is honoured and nothing to drift.
  select * into v_settings from app_settings where id = 1;
  if not coalesce(v_settings.vouchers_enabled, false) then
    return '[]'::jsonb;
  end if;

  -- A BLANK SLUG MEANS "DO NOT FILTER", NOT "USE THE DEFAULT COUNTER".
  --
  -- resolve_pickup_branch_id(null) answers with the first active branch by
  -- sort_order, and calling it here on a customer who has chosen nothing would
  -- quietly narrow the list to that one counter. That is the exact mistake the
  -- counter picker was built to undo: PRODUCT.md records that hiding the choice
  -- meant "the shop somebody collected from was decided for them and named only
  -- in a footnote". Deciding which promos they may hear about the same way
  -- would be the same bug wearing a different hat.
  --
  -- So an unchosen counter lists every promo, and a branch-scoped one arrives
  -- carrying its branchNames for the card to print. The customer sees the
  -- restriction in words, and resolve_voucher still refuses it at the wrong
  -- counter with VOUCHER_WRONG_BRANCH. An unknown slug resolves to null and is
  -- treated as unchosen rather than as a reason to show nothing, because a
  -- stale cookie must not empty the page.
  if nullif(btrim(coalesce(p_branch_slug, '')), '') is not null then
    v_branch_id := resolve_pickup_branch_id(p_branch_slug);
  end if;

  -- NEW IN 0078. Ranked codes first in the owner's order, then the unranked
  -- in the old soonest-ending order. Both sort keys are dropped from the
  -- payload: they are how the list is arranged, not something to render.
  select coalesce(
      jsonb_agg(
        to_jsonb(q) - 'sortExpires' - 'sortPriority'
        order by q."sortPriority" nulls last, q."sortExpires", q.code
      ),
      '[]'::jsonb
    )
  into v_rows
  from (
  -- NEW IN 0078. Whether the owner placed this code. The storefront features
  -- the first placed code still on its list AFTER its own filters (the
  -- spent-codes cookie runs there, not here), so this says only "placed",
  -- and which one leads is decided where the final list is known.
  select
    p.*,
    p."sortPriority" is not null as placed
  from (
    select
      v.code,
      v.description,
      -- Every one of these is nullable and none of the nulls means zero. They
      -- travel as nulls and the TypeScript parse branches on them, per
      -- AGENTS.md rule 6. A coalesce here would turn a percentage promo into
      -- "PHP 0.00 off" on a public page.
      v.amount_cents        as "amountCents",
      v.percent_off         as "percentOff",
      v.max_discount_cents  as "maxDiscountCents",
      v.min_order_cents     as "minOrderCents",
      v.expires_at          as "expiresAt",
      -- NEW IN 0077. Null when the voucher has no poster, and all four are
      -- null together (vouchers_poster_complete).
      v.poster_url            as "posterUrl",
      v.poster_width          as "posterWidth",
      v.poster_height         as "posterHeight",
      v.poster_blur_data_url  as "posterBlurDataUrl",
      -- Whether this one is being shown because it belongs to the person
      -- asking, so the page can group it apart from the public offers rather
      -- than present a loyalty reward as a general promotion.
      (
        v.owner_user_id is not null
        or exists (
          select 1 from voucher_customers vc
          where vc.voucher_id = v.id and vc.user_id = v_user_id
        )
      ) as personal,
      coalesce(
        (select jsonb_agg(mi.name order by mi.name)
         from voucher_items vi join menu_items mi on mi.id = vi.item_id
         where vi.voucher_id = v.id),
        '[]'::jsonb
      ) as "itemNames",
      coalesce(
        (select jsonb_agg(mc.name order by mc.name)
         from voucher_categories vcat join menu_categories mc on mc.id = vcat.category_id
         where vcat.voucher_id = v.id),
        '[]'::jsonb
      ) as "categoryNames",
      coalesce(
        (select jsonb_agg(b.name order by b.name)
         from voucher_branches vb join branches b on b.id = vb.branch_id
         where vb.voucher_id = v.id),
        '[]'::jsonb
      ) as "branchNames",
      -- Soonest to expire first, and the ones that never expire last rather
      -- than first, which is where a null would sort by default here. Dropped
      -- from the payload above: it is a sort key, not something to render.
      coalesce(v.expires_at, 'infinity'::timestamptz) as "sortExpires",
      -- NEW IN 0078. The owner's rank, or null for "not placed".
      v.display_priority as "sortPriority"
    from vouchers v
    where
      -- Rules 2 and 3 of resolve_voucher, with its null semantics intact:
      -- a null start is "live already", a null expiry is "never ends".
      v.is_active
      and (v.starts_at is null or v_now >= v.starts_at)
      and (v.expires_at is null or v_now < v.expires_at)
      -- The exhaustion rule, read rather than raced. A null max_uses is
      -- unlimited; reading it as zero would hide every open promo.
      and (v.max_uses is null or v.uses_count < v.max_uses)
      -- Rule 4, the owner half.
      and (v.owner_user_id is null or v.owner_user_id = v_user_id)
      -- Rule 4, the restriction list half. Matched on account only, for the
      -- enumeration reason in 0074's header.
      and (
        not exists (select 1 from voucher_customers vc where vc.voucher_id = v.id)
        or exists (
          select 1 from voucher_customers vc
          where vc.voucher_id = v.id and vc.user_id = v_user_id
        )
      )
      -- Rule 5, applied only once a counter is actually chosen. An empty
      -- voucher_branches means every counter.
      and (
        v_branch_id is null
        or not exists (select 1 from voucher_branches vb where vb.voucher_id = v.id)
        or exists (
          select 1 from voucher_branches vb
          where vb.voucher_id = v.id and vb.branch_id = v_branch_id
        )
      )
      -- NEW IN 0076. Already spent by the person asking, so there is nothing
      -- left to advertise. A guest has no account to count against and is
      -- simply not filtered here; the storefront's cookie covers that browser,
      -- and checkout refuses a guest over their cap regardless.
      and (
        v_user_id is null
        or (
          select count(*)
          from voucher_redemptions r
          where r.voucher_id = v.id and r.user_id = v_user_id
        ) < v.max_uses_per_customer
      )
      -- The visibility gate: either the owner published it, or it is this
      -- customer's own and they are entitled to be told whether or not it was
      -- advertised.
      and (
        v.publicise
        or v.owner_user_id = v_user_id
        or exists (
          select 1 from voucher_customers vc
          where vc.voucher_id = v.id and vc.user_id = v_user_id
        )
      )
  ) p
  ) q;

  return v_rows;
end;
$$;

comment on function list_customer_promos(text) is
  'Promo codes that may be shown to the caller at one counter: publicised '
  'codes for everyone, plus the signed-in caller own vouchers, minus any the '
  'caller has no redemptions left on. Returns an empty array when '
  'vouchers_enabled is off. Applies every eligibility rule resolve_voucher '
  'applies except the ones needing a cart, so a listed code is live but is '
  'not promised to fit the order. Ordered by the owner''s display_priority '
  'first, then soonest ending; placed says whether a row has a rank.';
