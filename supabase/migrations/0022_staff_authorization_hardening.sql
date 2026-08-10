-- 0022_staff_authorization_hardening.sql
-- Make the database enforce the same Workspace permissions and branch scope
-- as the application, then make all future Data API exposure opt-in.

-- No browser role may create an object that a SECURITY DEFINER function could
-- resolve through its pinned public search path.
revoke create on schema public from public, anon, authenticated;

-- Supabase projects created with the legacy Data API defaults grant new
-- tables, functions, and sequences to client roles. Take those defaults back
-- for every future object created by the migration owner.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;

-- Direct owner-tool writes would bypass the audit trail. They remain closed
-- until the corresponding audited RPC is built.
revoke insert, update, delete on
  price_lists,
  branches,
  store_hours,
  menu_categories,
  menu_items,
  item_variations,
  menu_option_groups,
  menu_options,
  menu_item_option_groups,
  item_variation_prices,
  menu_option_variation_prices,
  vouchers,
  staff_invitations,
  staff_permission_overrides
  from authenticated;
revoke update on app_settings, franchise_inquiries from authenticated;

create or replace function current_staff_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case
      when p.role = 'admin'::public.user_role then true
      else coalesce(
        (
          select o.granted
          from public.staff_permission_overrides o
          where o.profile_id = p.id and o.permission = p_permission
        ),
        case p.staff_role
          when 'cashier'::public.staff_role then p_permission = any(array[
            'dashboard:view', 'orders:view', 'orders:manage', 'menu:view',
            'menu:availability', 'pos:manage', 'store:availability'
          ]::text[])
          when 'kitchen'::public.staff_role then p_permission = any(array[
            'orders:view', 'orders:manage'
          ]::text[])
          when 'manager'::public.staff_role then p_permission = any(array[
            'dashboard:view', 'orders:view', 'orders:manage', 'menu:view',
            'menu:availability', 'menu:configure', 'pos:manage',
            'analytics:view', 'vouchers:manage', 'store:availability',
            'settings:manage', 'audit:view'
          ]::text[])
          else false
        end
      )
    end
    from public.profiles p
    where p.id = auth.uid() and p.is_active
  ), false)
$$;

create or replace function current_staff_can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role in ('admin'::public.user_role, 'staff'::public.user_role)
      and (p.branch_id is null or p.branch_id = p_branch_id)
  )
$$;

revoke execute on function current_staff_has_permission(text)
  from public, anon, authenticated;
revoke execute on function current_staff_can_access_branch(uuid)
  from public, anon, authenticated;
grant execute on function current_staff_has_permission(text) to authenticated;
grant execute on function current_staff_can_access_branch(uuid) to authenticated;

-- A staff login only needs its own profile unless it has the audit permission.
-- This prevents cashier and kitchen tokens from enumerating coworker details.
drop policy if exists "staff read profiles" on profiles;
create policy "authorized staff read profiles" on profiles
  for select using (
    id = auth.uid()
    or current_staff_has_permission('audit:view')
  );

-- Catalog visibility follows the resolved menu permission. Configuration
-- writes require the stronger permission if an audited RPC grants table access
-- in a later migration.
drop policy if exists "staff read price lists" on price_lists;
create policy "staff read price lists" on price_lists
  for select using (current_staff_has_permission('menu:view'));

drop policy if exists "staff read categories" on menu_categories;
create policy "staff read categories" on menu_categories
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write categories" on menu_categories;
create policy "staff write categories" on menu_categories
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

drop policy if exists "staff read items" on menu_items;
create policy "staff read items" on menu_items
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write items" on menu_items;
create policy "staff write items" on menu_items
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

drop policy if exists "staff read variations" on item_variations;
create policy "staff read variations" on item_variations
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write variations" on item_variations;
create policy "staff write variations" on item_variations
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

drop policy if exists "staff read option groups" on menu_option_groups;
create policy "staff read option groups" on menu_option_groups
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write option groups" on menu_option_groups;
create policy "staff write option groups" on menu_option_groups
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

drop policy if exists "staff read options" on menu_options;
create policy "staff read options" on menu_options
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write options" on menu_options;
create policy "staff write options" on menu_options
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

drop policy if exists "staff read item option groups" on menu_item_option_groups;
create policy "staff read item option groups" on menu_item_option_groups
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write item option groups" on menu_item_option_groups;
create policy "staff write item option groups" on menu_item_option_groups
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

drop policy if exists "staff read variation prices" on item_variation_prices;
create policy "staff read variation prices" on item_variation_prices
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write variation prices" on item_variation_prices;
create policy "staff write variation prices" on item_variation_prices
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

drop policy if exists "staff read option variation prices" on menu_option_variation_prices;
create policy "staff read option variation prices" on menu_option_variation_prices
  for select using (current_staff_has_permission('menu:view'));
drop policy if exists "staff write option variation prices" on menu_option_variation_prices;
create policy "staff write option variation prices" on menu_option_variation_prices
  for all using (current_staff_has_permission('menu:configure'))
  with check (current_staff_has_permission('menu:configure'));

-- Operational rows require both the resolved order permission and the staff
-- member's assigned branch. A null staff branch deliberately means all sites.
drop policy if exists "staff read pickup slots" on pickup_slots;
create policy "staff read pickup slots" on pickup_slots
  for select using (
    current_staff_has_permission('orders:view')
    and current_staff_can_access_branch(branch_id)
  );

drop policy if exists "staff read orders" on orders;
create policy "staff read orders" on orders
  for select using (
    current_staff_has_permission('orders:view')
    and current_staff_can_access_branch(branch_id)
  );

drop policy if exists "staff read order items" on order_items;
create policy "staff read order items" on order_items
  for select using (
    current_staff_has_permission('orders:view')
    and exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and current_staff_can_access_branch(o.branch_id)
    )
  );

drop policy if exists "staff read order item options" on order_item_options;
create policy "staff read order item options" on order_item_options
  for select using (
    current_staff_has_permission('orders:view')
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_options.order_item_id
        and current_staff_can_access_branch(o.branch_id)
    )
  );

drop policy if exists "staff read status events" on order_status_events;
create policy "staff read status events" on order_status_events
  for select using (
    current_staff_has_permission('orders:view')
    and exists (
      select 1 from public.orders o
      where o.id = order_status_events.order_id
        and current_staff_can_access_branch(o.branch_id)
    )
  );

drop policy if exists "staff read payments" on payments;
create policy "staff read payments" on payments
  for select using (
    current_staff_has_permission('orders:view')
    and exists (
      select 1 from public.orders o
      where o.id = payments.order_id
        and current_staff_can_access_branch(o.branch_id)
    )
  );

drop policy if exists "staff read pos sync" on pos_sync;
create policy "staff read pos sync" on pos_sync
  for select using (
    current_staff_has_permission('pos:manage')
    and exists (
      select 1 from public.orders o
      where o.id = pos_sync.order_id
        and current_staff_can_access_branch(o.branch_id)
    )
  );

drop policy if exists "staff read carts" on carts;
create policy "staff read carts" on carts
  for select using (
    current_staff_has_permission('orders:view')
    and current_staff_can_access_branch(branch_id)
  );
drop policy if exists "staff read cart items" on cart_items;
create policy "staff read cart items" on cart_items
  for select using (
    current_staff_has_permission('orders:view')
    and exists (
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and current_staff_can_access_branch(c.branch_id)
    )
  );
drop policy if exists "staff read cart item options" on cart_item_options;
create policy "staff read cart item options" on cart_item_options
  for select using (
    current_staff_has_permission('orders:view')
    and exists (
      select 1
      from public.cart_items ci
      join public.carts c on c.id = ci.cart_id
      where ci.id = cart_item_options.cart_item_id
        and current_staff_can_access_branch(c.branch_id)
    )
  );

drop policy if exists "admin reads audit log" on audit_logs;
create policy "authorized staff read audit log" on audit_logs
  for select using (current_staff_has_permission('audit:view'));

drop policy if exists "staff read vouchers" on vouchers;
create policy "authorized staff read vouchers" on vouchers
  for select using (current_staff_has_permission('vouchers:manage'));
drop policy if exists "staff read redemptions" on voucher_redemptions;
create policy "authorized staff read redemptions" on voucher_redemptions
  for select using (current_staff_has_permission('vouchers:manage'));

drop policy if exists "staff read franchise inquiries" on franchise_inquiries;
create policy "admin reads franchise inquiries" on franchise_inquiries
  for select using (is_admin());

-- The guest signal contains no data, but the trigger still runs with the table
-- owner's privileges. It only needs pg_catalog and the explicitly qualified
-- realtime.send function.
alter function broadcast_order_tracking_status() set search_path = pg_catalog;

-- SUPER_ADMIN_EMAIL authorizes the application caller. This service-role-only
-- RPC makes the database change, prior-admin revocation, and audit trail one
-- transaction. The unique index prevents two active admin profiles.
create unique index profiles_one_active_admin_idx
  on profiles ((role))
  where role = 'admin' and is_active;

create or replace function provision_configured_super_admin(
  p_user_id uuid,
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_target_before public.profiles%rowtype;
  v_old public.profiles%rowtype;
  v_other_active int;
  v_name text;
begin
  perform 1 from public.app_settings where id = 1 for update;

  select * into v_target_before
  from public.profiles
  where id = p_user_id;

  select count(*)::int into v_other_active
  from public.profiles
  where role = 'admin'::public.user_role
    and is_active
    and id <> p_user_id;

  if v_target_before.id is not null
     and v_target_before.role = 'admin'::public.user_role
     and v_target_before.staff_role is null
     and v_target_before.branch_id is null
     and v_target_before.is_active
     and v_other_active = 0 then
    return;
  end if;

  v_name := coalesce(
    nullif(trim(p_display_name), ''),
    nullif(trim(v_target_before.display_name), ''),
    'Super Admin'
  );

  insert into public.profiles
    (id, role, staff_role, display_name, branch_id, is_active)
  values
    (p_user_id, 'admin', null, v_name, null, false)
  on conflict (id) do update set
    role = 'admin',
    staff_role = null,
    display_name = v_name,
    branch_id = null,
    is_active = false;

  for v_old in
    select * from public.profiles
    where role = 'admin'::public.user_role
      and is_active
      and id <> p_user_id
    for update
  loop
    update public.profiles set is_active = false where id = v_old.id;
    insert into public.audit_logs
      (actor_profile_id, action, target_table, target_id, diff)
    values (
      p_user_id,
      'staff.super_admin_revoked_by_configuration',
      'profiles',
      v_old.id::text,
      jsonb_build_object(
        'before', to_jsonb(v_old),
        'after', jsonb_build_object('is_active', false)
      )
    );
  end loop;

  update public.profiles set is_active = true where id = p_user_id;
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, diff)
  values (
    p_user_id,
    'staff.super_admin_bootstrapped',
    'profiles',
    p_user_id::text,
    jsonb_build_object(
      'before', case
        when v_target_before.id is null then null
        else to_jsonb(v_target_before)
      end,
      'after', jsonb_build_object(
        'role', 'admin',
        'staff_role', null,
        'branch_id', null,
        'is_active', true
      )
    )
  );
end;
$$;

revoke execute on function provision_configured_super_admin(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function provision_configured_super_admin(uuid, text)
  to service_role;
