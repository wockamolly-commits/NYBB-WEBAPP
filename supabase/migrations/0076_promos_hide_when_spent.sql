-- 0076_promos_hide_when_spent.sql
--
-- Stop advertising a promo to somebody who has already had it.
--
-- WHY THIS IS NOT "ONCE USED", WHICH IS WHAT WAS ASKED FOR. `max_uses_per_customer`
-- is `not null default 1`, so for every code that exists today the two readings
-- are the same sentence. They come apart the moment an owner writes a promo
-- worth three visits: hiding it after the first would take away two uses the
-- customer still holds, and the advert is the only place they would have learned
-- that. So the test is "can this person still redeem it", which is the same
-- question the checkout asks, and which collapses to "have they used it" for
-- every one-per-customer code.
--
-- IT COUNTS ON THE ACCOUNT, AND resolve_voucher COUNTS ON THE PHONE. That is a
-- deliberate difference rather than a drift. 0065 records the reason for its
-- choice: `orders.user_id` is null on most orders here, so a cap that only
-- understood accounts would not bind the people it is written for. This
-- function has no phone to count on and must never ask for one, for the
-- enumeration reason 0074's header sets out, so the account is the only
-- identity available to it. The consequence is bounded and safe in the right
-- direction: the worst it does is keep advertising a promo to a guest who
-- already spent it, and checkout then refuses that guest with
-- VOUCHER_CUSTOMER_LIMIT exactly as it does today. It can never hide a promo
-- somebody is still entitled to, and it can never reveal one they are not.
--
-- The storefront closes the guest half of that gap in a cookie, which only ever
-- hides, so a browser that placed the order remembers without the database
-- having to be told who was holding it.
--
-- IT SELF CORRECTS. 0065 gives a use back by DELETING the voucher_redemptions
-- row when an order is cancelled or rejected, so an order that fell over stops
-- counting here on its own and the promo comes back. That is why this counts
-- redemptions rather than reading a flag written at placement: an online order
-- is placed unpaid and the expiry sweep cancels it, and a customer who never
-- paid has not used anything.

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

  select coalesce(
      jsonb_agg(to_jsonb(p) - 'sortExpires' order by p."sortExpires", p.code),
      '[]'::jsonb
    )
  into v_rows
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
      coalesce(v.expires_at, 'infinity'::timestamptz) as "sortExpires"
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
  ) p;

  return v_rows;
end;
$$;

comment on function list_customer_promos(text) is
  'Promo codes that may be shown to the caller at one counter: publicised '
  'codes for everyone, plus the signed-in caller own vouchers, minus any the '
  'caller has no redemptions left on. Returns an empty array when '
  'vouchers_enabled is off. Applies every eligibility rule resolve_voucher '
  'applies except the ones needing a cart, so a listed code is live but is '
  'not promised to fit the order.';

-- The lookup the new clause makes on every listing read. Partial, because a
-- redemption without an account is the common row here and this side of the
-- question never asks about one.
create index if not exists voucher_redemptions_user_voucher_idx
  on voucher_redemptions (user_id, voucher_id)
  where user_id is not null;
