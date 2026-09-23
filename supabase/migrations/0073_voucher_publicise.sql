-- 0073_voucher_publicise.sql
--
-- Let the owner say which promo codes may be advertised.
--
-- THE PROPERTY THIS DELIBERATELY GIVES UP, AND HOW FAR. 0009 gave customers no
-- select on vouchers, and said why: "an invalid code and an inactive one are
-- indistinguishable from the outside, and the code space cannot be scraped".
-- That is worth keeping, and it is kept. What changes is that one boolean per
-- row can now opt a single code out of it, and the default is off, so every
-- code that exists today and every code created without thinking about this
-- keeps the old property exactly. A quiet code handed out on a flyer stays
-- quiet. Only a code somebody deliberately ticked becomes listable, and 0074
-- is the only thing that may list it.
--
-- WHY NOT DERIVE IT. "Advertise every code with no customer restriction" was
-- the alternative and it needs no column, but it takes away the campaign the
-- owner most obviously wants: a code printed on a receipt, or read out at the
-- counter, that works for anyone who has it and is not published to everyone
-- who does not. Making that undeclarable to save a boolean is a bad trade.
--
-- PUBLICISE IS NOT A TERM. 0067 freezes a code's terms once it has met an
-- order, because rewriting an amount under somebody who already used it makes
-- every human reading of their order wrong. Whether a live code is advertised
-- says nothing about what anybody was offered, so it is not frozen, for the
-- same reason 0067 left admin_set_voucher_active alone: "Off is not a change to
-- the terms". It gets its own switch below for exactly that reason, and the
-- upsert also carries it so a campaign can be created already publicised.

-- ---------------------------------------------------------------------------
-- 1. The column.
-- ---------------------------------------------------------------------------
alter table vouchers
  add column publicise boolean not null default false;

comment on column vouchers.publicise is
  'Whether this code may be listed to customers who have not been told it. '
  'False, the default, means redeemable but never advertised, which is how '
  'every voucher behaved before 0073 and how most should keep behaving. '
  'Read only by list_customer_promos (0074); the redemption path ignores it '
  'entirely, so ticking or unticking it never changes what a code is worth.';

-- Partial, because the advertised codes are the small minority and a listing
-- read has no interest in the rest. The same reasoning as orders_voucher_idx
-- in 0067.
create index vouchers_publicise_idx on vouchers (publicise) where publicise;

-- ---------------------------------------------------------------------------
-- 2. The switch, which has to work on a locked code.
-- ---------------------------------------------------------------------------
--
-- Its own function rather than a trip through the upsert, for both of the
-- reasons the codebase already has one of these. 0066 says pulling a code that
-- is being abused should not require the form to round-trip every other field
-- correctly first, and the same is true of pulling an advert. 0067 adds the
-- harder one: once a code has met an order the upsert refuses outright, so a
-- publicise toggle that only lived there would become unreachable at exactly
-- the point it matters most, which is a live campaign the owner wants to stop
-- advertising without stopping it working for the people already holding it.
create or replace function admin_set_voucher_publicise(
  p_voucher_id uuid,
  p_publicise boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before   boolean;
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_voucher_id is null or p_publicise is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select publicise into v_before from vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
  end if;

  update vouchers set publicise = p_publicise where id = p_voucher_id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    case when p_publicise then 'voucher.publicise' else 'voucher.unpublicise' end,
    'vouchers',
    p_voucher_id::text,
    jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(p_publicise))
  );
end;
$$;

-- service_role is named in the revoke as well as anon and authenticated.
-- Supabase ships a default EXECUTE grant to all three that a revoke from
-- public does not touch, which is Handoff trap 14 and the reason 0048 spells
-- it out. This function is only ever reached from a staff browser session, and
-- current_staff_has_permission would refuse a service-role caller anyway since
-- it has no auth.uid(), so the grant would be one nobody holds for a reason.
revoke execute on function admin_set_voucher_publicise(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function admin_set_voucher_publicise(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The upsert, restated so a code can be created already publicised.
-- ---------------------------------------------------------------------------
--
-- Restated in full rather than patched, for the reason 0067 gives: 0066 and
-- 0067 are live and a migration here is forward only. This is 0067's body with
-- one column added in three places and nothing else touched. In particular the
-- VOUCHER_LOCKED guard is unchanged, which is why section 2 above exists: once
-- a code has met an order this function refuses, and admin_set_voucher_publicise
-- is then the only way to pull the advert.
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
        starts_at, expires_at, is_active, owner_user_id, publicise
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
        nullif(p_voucher->>'ownerUserId', '')::uuid,
        coalesce((p_voucher->>'publicise')::boolean, false)
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
        owner_user_id = nullif(p_voucher->>'ownerUserId', '')::uuid,
        -- False when the form omits it, which is the opposite direction to
        -- isActive's coalesce just above and deliberately so: an advert is
        -- opt in, so a payload that forgot the field must not start
        -- advertising a code that was not being advertised before.
        publicise = coalesce((p_voucher->>'publicise')::boolean, false)
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
