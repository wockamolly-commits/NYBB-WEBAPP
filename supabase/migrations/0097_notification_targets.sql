-- 0097: who a push reaches, and how often.
--
-- 1. The customer's "your order is ready" push went out on every Ready tap.
--    staff_set_order_status (0035) treats a transition to the status an order
--    already has as a successful no-op, so a second tablet, or a stale board,
--    tapping Ready on an order that was already ready got {ok: true} and sent
--    the customer a second notification with a fresh buzz. The ready notice is
--    now claimed once per order, the way 0048 claims the counter's new-order
--    notice. Ring again (0085) is a separate, deliberate path and unaffected.
--
-- 2. staff_push_targets (0038) checked only that a profile was active and could
--    reach the branch. A per-user override that took orders:view away left
--    that person's tablet subscription receiving every new-order and arrival
--    alert. It now also requires orders:view, resolved for that profile the
--    same way current_staff_has_permission resolves it for the caller.

alter table orders add column if not exists customer_ready_notified_at timestamptz;

create or replace function claim_customer_ready_notice(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_claimed boolean;
begin
  if p_order_id is null then
    return false;
  end if;

  -- One statement, so two callers racing for the same order cannot both win.
  update public.orders
     set customer_ready_notified_at = now()
   where id = p_order_id
     and status = 'ready'
     and customer_ready_notified_at is null
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

comment on function claim_customer_ready_notice(uuid) is
  'Claims the right to tell the customer their order is ready, once. True '
  'means send. Since 0097.';

revoke execute on function claim_customer_ready_notice(uuid)
  from public, anon, authenticated, service_role;
grant execute on function claim_customer_ready_notice(uuid) to service_role;

-- current_staff_has_permission (0060) for a named profile rather than the
-- caller. Same rule, arm for arm.
create or replace function staff_profile_has_permission(p_profile_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case
      when p.role = 'admin'::public.user_role then true
      when p.branch_id is not null and public.business_wide_permission(p_permission) then
        coalesce((
          select o.granted
          from public.staff_permission_overrides o
          where o.profile_id = p.id and o.permission = p_permission
        ), false)
      else coalesce(
        (
          select o.granted
          from public.staff_permission_overrides o
          where o.profile_id = p.id and o.permission = p_permission
        ),
        public.role_default_permission(p.staff_role, p_permission)
      )
    end
    from public.profiles p
    where p.id = p_profile_id and p.is_active
  ), false)
$$;

revoke execute on function staff_profile_has_permission(uuid, text)
  from public, anon, authenticated;

create or replace function staff_push_targets(p_branch_id uuid)
returns table (endpoint text, p256dh text, auth_key text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.endpoint, s.p256dh, s.auth_key
  from public.push_subscriptions s
  where s.audience = 'staff'
    and s.transport = 'web'
    and s.profile_id is not null
    and public.staff_can_access_branch(s.profile_id, p_branch_id)
    and public.staff_profile_has_permission(s.profile_id, 'orders:view')
$$;
