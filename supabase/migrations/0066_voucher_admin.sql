-- 0066_voucher_admin.sql
-- The writes behind /workspace/vouchers, and the one permission change the
-- screen needs.
--
-- Third and last of the voucher migrations, and like the other two it lands
-- before the code that calls it. Spec section 18.
--
-- WHY THE WRITES ARE FUNCTIONS RATHER THAN GRANTS.
--
-- 0022 revoked every write on vouchers from authenticated and left the reads to
-- a policy. That is the arrangement spec section 22 item 3 asks for and 0053
-- and 0054 already follow for the menu: a staff session that could update a row
-- directly could also skip the audit trail, and a promo code is money.
--
-- A voucher and its scope rows are saved together or not at all. Four separate
-- statements from the app would leave a code that is live everywhere for the
-- minute between the voucher landing and its branch list following, and a
-- minute is long enough for somebody to redeem it at the wrong counter.

-- ---------------------------------------------------------------------------
-- 1. Vouchers are a business wide capability.
-- ---------------------------------------------------------------------------
--
-- Restated whole from 0059 with one arm added, the way that migration restated
-- current_staff_has_permission for the same reason. The signature is unchanged,
-- so this is a genuine replace.
--
-- The argument is the one 0059 makes about the menu catalog. vouchers carries
-- no branch: a code is one row shared by every counter, and voucher_branches
-- narrows where it can be spent rather than who owns it. So a manager pinned to
-- one counter creating a code is creating it for the whole business, which is
-- the opposite of what an assignment is for. From here they do not get it from
-- their job role, and the Super Admin hands it over one person at a time with
-- an override row, which is the mechanism /workspace/team already offers.
--
-- lib/staff/roles.ts holds the app's copy of this list and
-- tests/sql/staff-business-wide-permissions.test.ts fails if the two disagree.
create or replace function business_wide_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_permission = any(array['menu:configure', 'vouchers:manage']::text[])
$$;

-- ---------------------------------------------------------------------------
-- 2. Creating and editing a voucher.
-- ---------------------------------------------------------------------------
--
-- One payload carrying the whole record, including its scope lists, because
-- that is what the form holds and what a save has to be atomic across. A key
-- that is absent reads the same as a key that is null, so the caller sends the
-- complete record every time rather than a patch; lib/vouchers/schema.ts is
-- what guarantees it does.
--
-- NULL IS NOT ZERO HERE EITHER. amount_cents null is a percentage voucher,
-- max_uses null is unlimited, max_discount_cents null is uncapped, and both
-- dates null are "already open" and "never ends". The ->> operator yields SQL
-- null for a JSON null, which is exactly right, and it is the app side that has
-- to resist the temptation to coerce. AGENTS.md rule 6.
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

comment on function admin_upsert_voucher(jsonb) is
  'Creates or replaces one voucher and its whole scope, in one transaction. '
  'The payload is the complete record: an absent key means null, which for '
  'amount_cents, max_uses, max_discount_cents and both dates is a meaning of '
  'its own and never zero.';

revoke execute on function admin_upsert_voucher(jsonb) from public, anon, authenticated;
grant execute on function admin_upsert_voucher(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Switching one off, which is the reversible half of deleting it.
-- ---------------------------------------------------------------------------
--
-- Its own function rather than a trip through the upsert, because disabling a
-- code that is being abused is an emergency and should not require the form to
-- round-trip every other field correctly first.
create or replace function admin_set_voucher_active(
  p_voucher_id uuid,
  p_active boolean
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
  if p_voucher_id is null or p_active is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select is_active into v_before from vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'VOUCHER_NOT_FOUND' using errcode = 'P0001';
  end if;

  update vouchers set is_active = p_active where id = p_voucher_id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    case when p_active then 'voucher.enable' else 'voucher.disable' end,
    'vouchers',
    p_voucher_id::text,
    jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(p_active))
  );
end;
$$;

revoke execute on function admin_set_voucher_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function admin_set_voucher_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Deleting one, only while it has never been used.
-- ---------------------------------------------------------------------------
--
-- voucher_redemptions.voucher_id is `on delete restrict` (0008), so a redeemed
-- voucher cannot be removed and its history cannot be rewritten. That refusal
-- would otherwise reach the screen as a foreign key error, so it is named here.
-- A code that has been used is disabled, not deleted, and the screen leads with
-- that.
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

  if exists (select 1 from voucher_redemptions where voucher_id = p_voucher_id) then
    raise exception 'VOUCHER_IN_USE' using errcode = 'P0001';
  end if;

  delete from vouchers where id = p_voucher_id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (v_actor_id, 'voucher.delete', 'vouchers', p_voucher_id::text,
          jsonb_build_object('before', v_before, 'after', null));
end;
$$;

revoke execute on function admin_delete_voucher(uuid) from public, anon, authenticated;
grant execute on function admin_delete_voucher(uuid) to authenticated;
