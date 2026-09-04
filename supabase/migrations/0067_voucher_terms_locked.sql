-- 0067_voucher_terms_locked.sql
--
-- Freeze a promo code's terms once it has met an order.
--
-- THE PROBLEM. 0066 let a voucher be edited at any point in its life. A code
-- that took PHP 50 off somebody's lunch on Monday could be rewritten on Tuesday
-- to say 10% off, and nothing in the record would show that the Monday order
-- was placed under different terms. The order keeps its own resolved
-- discount_cents, so no money moves, but every human reading of that order is
-- wrong from then on: the receipt says LAUNCH50, the voucher says 10%, and
-- nobody can tell which one the customer was actually offered. Scope is worse
-- than the amount. Adding a branch limit after the fact makes a past redemption
-- look like it happened somewhere the code did not apply.
--
-- WHAT COUNTS AS USED. Any order that ever named the code, not just a
-- successful redemption. 0065 gives a use back when an order is cancelled or
-- rejected, and return_voucher_on_order_failure does that by DELETING the
-- voucher_redemptions row, so redemptions alone would unlock a code the moment
-- its only order fell over. orders.voucher_id survives that, because the order
-- still happened and still says which code was tried on it. So the test is
-- "has this code ever met an order", which is also the plainer sentence to put
-- in front of staff.
--
-- WHAT IS STILL ALLOWED. Switching it off, through admin_set_voucher_active,
-- which is deliberately left exactly as it was. Off is not a change to the
-- terms: it stops the code being accepted from now on and says nothing about
-- what it was worth to anybody who already used it. It has to keep working,
-- because it is the only way to stop a live code that is losing money, and a
-- freeze that also froze the brakes would be a worse bug than the one being
-- fixed here. The screen says so in those words, and points at it.
--
-- Creating a code is untouched, and so is editing one nobody has tried yet,
-- which is the ordinary case: build the campaign, correct it, launch it.
--
-- WHY A SEPARATE PREDICATE. voucher_is_locked is the only definition of
-- "locked" in the system. The two writes that must refuse and the screen that
-- must explain the refusal all read it, so the form cannot come to disagree
-- with the function about which codes are editable, which is the drift that
-- would show a staff member an open form and then reject the save.

-- ---------------------------------------------------------------------------
-- 1. The index the predicate reads.
-- ---------------------------------------------------------------------------
--
-- orders.voucher_id has been unindexed since 0008 because nothing read it in
-- that direction. Partial, because the overwhelming majority of orders carry no
-- code at all and there is no reason to index a column of nulls.
create index if not exists orders_voucher_idx
  on orders (voucher_id)
  where voucher_id is not null;

-- ---------------------------------------------------------------------------
-- 2. What locked means.
-- ---------------------------------------------------------------------------
--
-- Internal, like the resolvers in 0065: callable by neither anon nor
-- authenticated, because it reads across every branch's orders and the two
-- functions below reach it as their own definer. The screen asks through
-- admin_voucher_locked instead, which checks the permission first.
create or replace function voucher_is_locked(p_voucher_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from orders where voucher_id = p_voucher_id)
      or exists (select 1 from voucher_redemptions where voucher_id = p_voucher_id);
$$;

revoke execute on function voucher_is_locked(uuid) from public, anon, authenticated;

comment on function voucher_is_locked(uuid) is
  'True once any order has named this voucher, successfully or not. The single '
  'definition of "the terms are frozen", read by the writes and by the screen.';

-- ---------------------------------------------------------------------------
-- 3. The same question, asked by the workspace.
-- ---------------------------------------------------------------------------
--
-- The editor has to know before it draws the form, and it cannot work this out
-- for itself: a branch-assigned manager cannot see another counter's orders
-- under the 0059 policies, so counting orders from the app would report "not
-- locked" for a code used at a branch they do not hold, open the form, and then
-- have the save refused. Asking SQL keeps one answer.
create or replace function admin_voucher_locked(p_voucher_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return voucher_is_locked(p_voucher_id);
end;
$$;

revoke execute on function admin_voucher_locked(uuid) from public, anon, authenticated;
grant execute on function admin_voucher_locked(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The two writes that must now refuse.
-- ---------------------------------------------------------------------------
--
-- Both are restated in full rather than patched, because 0066 is live and a
-- migration here is forward only. admin_set_voucher_active is NOT restated: it
-- is correct as it stands and must keep working on a locked code.

create or replace function admin_upsert_voucher(p_voucher jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id  uuid := auth.uid();
  v_id        uuid;
  v_before    jsonb;
  v_code      text;
  v_existing  vouchers%rowtype;
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_voucher is null or jsonb_typeof(p_voucher) is distinct from 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  v_code := nullif(upper(btrim(coalesce(p_voucher->>'code', ''))), '');
  if v_code is null then
    raise exception 'MISSING_CODE' using errcode = 'P0001';
  end if;
  -- Loose on purpose: the owner writes these, they go on posters, and a code
  -- with a hyphen in it is not a mistake. What this rejects is whitespace and
  -- anything long enough to be a paste accident.
  if length(v_code) > 40 or v_code ~ '\s' then
    raise exception 'INVALID_CODE' using errcode = 'P0001';
  end if;

  -- Exactly one kind of discount. vouchers_one_discount_kind (0008) enforces
  -- it, and catching it here means the screen gets a name rather than a
  -- constraint violation.
  if (p_voucher->>'amountCents' is not null) = (p_voucher->>'percentOff' is not null) then
    raise exception 'ONE_DISCOUNT_KIND' using errcode = 'P0001';
  end if;

  v_id := nullif(p_voucher->>'id', '')::uuid;

  if v_id is not null then
    select * into v_existing from vouchers where id = v_id for update;
    if not found then
      raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
    end if;
    v_before := to_jsonb(v_existing);

    -- THE TERMS ARE FROZEN ONCE THE CODE HAS MET AN ORDER.
    --
    -- A create is untouched; this is only ever an edit. The refusal is named
    -- so the screen can explain it rather than showing a constraint.
    if voucher_is_locked(v_id) then
      raise exception 'VOUCHER_LOCKED' using errcode = 'P0001';
    end if;
  end if;

  begin
    if v_id is null then
      insert into vouchers (
        code, description, note, amount_cents, percent_off, max_discount_cents,
        min_order_cents, max_uses, max_uses_per_customer,
        starts_at, expires_at, is_active, owner_user_id
      ) values (
        v_code,
        nullif(btrim(coalesce(p_voucher->>'description', '')), ''),
        nullif(btrim(coalesce(p_voucher->>'note', '')), ''),
        (p_voucher->>'amountCents')::bigint,
        (p_voucher->>'percentOff')::int,
        (p_voucher->>'maxDiscountCents')::bigint,
        coalesce((p_voucher->>'minOrderCents')::bigint, 0),
        (p_voucher->>'maxUses')::int,
        coalesce((p_voucher->>'maxUsesPerCustomer')::int, 1),
        (p_voucher->>'startsAt')::timestamptz,
        (p_voucher->>'expiresAt')::timestamptz,
        coalesce((p_voucher->>'isActive')::boolean, true),
        nullif(p_voucher->>'ownerUserId', '')::uuid
      )
      returning id into v_id;
    else
      update vouchers set
        code = v_code,
        description = nullif(btrim(coalesce(p_voucher->>'description', '')), ''),
        note = nullif(btrim(coalesce(p_voucher->>'note', '')), ''),
        amount_cents = (p_voucher->>'amountCents')::bigint,
        percent_off = (p_voucher->>'percentOff')::int,
        max_discount_cents = (p_voucher->>'maxDiscountCents')::bigint,
        min_order_cents = coalesce((p_voucher->>'minOrderCents')::bigint, 0),
        max_uses = (p_voucher->>'maxUses')::int,
        max_uses_per_customer = coalesce((p_voucher->>'maxUsesPerCustomer')::int, 1),
        starts_at = (p_voucher->>'startsAt')::timestamptz,
        expires_at = (p_voucher->>'expiresAt')::timestamptz,
        is_active = coalesce((p_voucher->>'isActive')::boolean, true),
        owner_user_id = nullif(p_voucher->>'ownerUserId', '')::uuid
      where id = v_id;
    end if;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_CODE' using errcode = 'P0001';
    when check_violation then
      -- The likely one by far: lowering a total cap under the uses already
      -- taken. Saying so is much more use than the constraint's own name.
      raise exception 'CAP_BELOW_USES' using errcode = 'P0001';
  end;

  -- Scope is replaced wholesale rather than diffed. The form holds the complete
  -- set, so a delete and an insert is both simpler and the only version that
  -- can express "this voucher no longer names any branch at all", which is the
  -- state that means it works everywhere.
  delete from voucher_branches where voucher_id = v_id;
  delete from voucher_items where voucher_id = v_id;
  delete from voucher_categories where voucher_id = v_id;
  delete from voucher_customers where voucher_id = v_id;

  insert into voucher_branches (voucher_id, branch_id)
  select v_id, value::uuid
  from jsonb_array_elements_text(coalesce(p_voucher->'branchIds', '[]'::jsonb));

  insert into voucher_items (voucher_id, item_id)
  select v_id, value::uuid
  from jsonb_array_elements_text(coalesce(p_voucher->'itemIds', '[]'::jsonb));

  insert into voucher_categories (voucher_id, category_id)
  select v_id, value::uuid
  from jsonb_array_elements_text(coalesce(p_voucher->'categoryIds', '[]'::jsonb));

  -- Normalised on the way in, so the list the admin typed and the digits a
  -- redemption is counted against are the same value. A number typed with
  -- spaces here would otherwise never match anybody.
  insert into voucher_customers (voucher_id, phone_digits)
  select distinct v_id, normalize_phone_digits(value)
  from jsonb_array_elements_text(coalesce(p_voucher->'customerPhones', '[]'::jsonb))
  where normalize_phone_digits(value) is not null;

  insert into voucher_customers (voucher_id, user_id)
  select distinct v_id, value::uuid
  from jsonb_array_elements_text(coalesce(p_voucher->'customerUserIds', '[]'::jsonb));

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    case when v_before is null then 'voucher.create' else 'voucher.update' end,
    'vouchers',
    v_id::text,
    jsonb_build_object(
      'before', v_before,
      'after', to_jsonb((select v from vouchers v where v.id = v_id)),
      'scope', jsonb_build_object(
        'branchIds', coalesce(p_voucher->'branchIds', '[]'::jsonb),
        'itemIds', coalesce(p_voucher->'itemIds', '[]'::jsonb),
        'categoryIds', coalesce(p_voucher->'categoryIds', '[]'::jsonb),
        'customerPhones', coalesce(p_voucher->'customerPhones', '[]'::jsonb),
        'customerUserIds', coalesce(p_voucher->'customerUserIds', '[]'::jsonb)
      )
    )
  );

  return v_id;
end;
$$;

create or replace function admin_delete_voucher(p_voucher_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before   jsonb;
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select to_jsonb(v) into v_before from vouchers v where v.id = p_voucher_id for update;
  if v_before is null then
    raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Widened from "has a redemption" to "has met an order", because deleting is
  -- the most complete edit there is. A cancelled order gives its use back and
  -- takes the redemption row with it, but orders.voucher_id still records that
  -- this code was applied, and deleting the voucher nulls that reference and
  -- erases the fact. The name staff already see is kept.
  if voucher_is_locked(p_voucher_id) then
    raise exception 'VOUCHER_IN_USE' using errcode = 'P0001';
  end if;

  delete from vouchers where id = p_voucher_id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (v_actor_id, 'voucher.delete', 'vouchers', p_voucher_id::text,
          jsonb_build_object('before', v_before, 'after', null));
end;
$$;
