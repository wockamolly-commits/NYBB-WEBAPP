-- 0095: customer phone numbers out of the audit trail.
--
-- The voucher save logged the restricted-customer phone list in full, under
-- scope.customerPhones. audit_logs rows about vouchers have a null branch, so
-- every holder of audit:view can read them, including a manager pinned to one
-- counter who has no vouchers:manage. That contradicts the owner's ruling that
-- the trail masks phone numbers (lib/staff/audit-log.ts), and masking on the
-- screen is not enough, because the same session can read the row directly.
--
-- Not changed here: whether such a manager sees voucher rows at all. The
-- owner ruled on 2026-08-27 that a branch manager sees business-wide rows,
-- naming the vouchers (see 0086), so the codes in those rows stay visible to
-- them until the owner says otherwise.
--
-- The function's body is 0073's admin_upsert_voucher, renamed by 0089.

create or replace function mask_phone_for_audit(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when length(d) >= 4 then repeat('*', length(d) - 4) || right(d, 4)
    else repeat('*', length(d))
  end
  from (select coalesce(public.normalize_phone_digits(p_phone), '') as d) as digits
$$;

revoke execute on function mask_phone_for_audit(text) from public, anon, authenticated;

create or replace function voucher_upsert_unchecked(p_voucher jsonb)
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
        -- Masked since 0095. The owner's ruling is that the workspace masks a
        -- phone number in the trail, and these rows are readable by every
        -- holder of audit:view, including managers who cannot open promo codes
        -- at all. The full list stays in voucher_customers, where only
        -- vouchers:manage can read it.
        'customerPhones', coalesce((
          select jsonb_agg(public.mask_phone_for_audit(value))
          from jsonb_array_elements_text(coalesce(p_voucher->'customerPhones', '[]'::jsonb))
        ), '[]'::jsonb),
        'customerUserIds', coalesce(p_voucher->'customerUserIds', '[]'::jsonb)
      )
    )
  );

  return v_id;
end;
$$;

-- Rows written before this migration, to the same masked form.
update audit_logs
   set diff = jsonb_set(
         diff,
         '{scope,customerPhones}',
         coalesce((
           select jsonb_agg(mask_phone_for_audit(value))
           from jsonb_array_elements_text(diff->'scope'->'customerPhones')
         ), '[]'::jsonb)
       )
 where target_table = 'vouchers'
   and jsonb_typeof(diff->'scope'->'customerPhones') = 'array'
   and jsonb_array_length(diff->'scope'->'customerPhones') > 0;
