-- 0074_list_customer_promos.sql
--
-- The one read that may tell a customer a promo code exists.
--
-- Everything else in the voucher engine answers a question about a code the
-- customer already typed. This answers "what is running", which is a different
-- and more dangerous question, so the whole function is written around keeping
-- the answer small.
--
-- WHAT IT WILL NOT SAY. It never returns an id, a note, uses_count, max_uses,
-- max_uses_per_customer or owner_user_id. It never mentions a code that was not
-- deliberately publicised (0073), so the code space stays unscrapeable exactly
-- as 0009 intended for every voucher nobody ticked. It never confirms or denies
-- a code by name, because it takes no code: there is no input here an attacker
-- can vary to learn anything, which is the property that makes a listing safer
-- than an oracle.
--
-- GUESTS NAMED BY PHONE ARE DELIBERATELY NOT RESOLVED. voucher_customers can
-- name somebody by phone_digits, and this function could take a phone number
-- and return their vouchers. It must not. That would answer "does this phone
-- number have a discount" for any number an unauthenticated caller cares to
-- try, which is an enumeration oracle over the customer list, bought for a
-- feature worth a few pesos to one guest who was told their code out of band
-- and can still type it at checkout. So the personal half below matches on
-- auth.uid() only, and a phone-targeted voucher is never listed to anybody.
--
-- CART DEPENDENT RULES ARE NOT APPLIED HERE, AND MUST NOT BE. min_order_cents,
-- the item and category scope, and max_uses_per_customer all need a cart and a
-- customer this function has not been shown. Filtering on them would need the
-- caller to send a cart, which turns a cacheable public listing into a per
-- request pricing call, and it would still be advisory. The page renders them
-- as words instead ("once that reaches PHP 500") and preview_voucher does the
-- real check when the customer applies one. The listing's contract is
-- therefore "these codes are live", never "these codes will work on your
-- order".

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
      -- enumeration reason in the header.
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
      -- And the new gate, the only one of these about visibility rather than
      -- validity: either the owner published it, or it is this customer's own
      -- and they are entitled to be told whether or not it was advertised.
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
  'codes for everyone, plus the signed-in caller own vouchers. Returns an '
  'empty array when vouchers_enabled is off. Applies every eligibility rule '
  'resolve_voucher applies except the ones needing a cart, so a listed code '
  'is live but is not promised to fit the order.';

-- Every role named explicitly rather than left to `revoke from public`.
-- Supabase ships a default privilege granting EXECUTE to anon, authenticated
-- and service_role which a revoke from public does not touch, and the harness
-- reproduces it, which is how this was caught. Handoff trap 14, and the reason
-- 0038, 0047 and 0048 all spell this out. service_role is named because no
-- server-side worker has any business asking what is on the storefront.
revoke execute on function list_customer_promos(text)
  from public, anon, authenticated, service_role;
grant execute on function list_customer_promos(text) to anon, authenticated;
