-- 0084_staff_delete_branch.sql
-- Permanently removing a branch from the workspace, when it is safe to.
--
-- WHAT "SAFE" MEANS HERE, AND WHY EACH RULE EXISTS.
--
-- Every table that points at branches was read before this was written, and
-- four of them make a plain DELETE wrong rather than merely blocked:
--
--   * orders (on delete restrict). An order is a sale, a payment and possibly
--     a refund. Its branch is part of that record, so a branch that has ever
--     taken one is never deleted. Switching it off is the answer.
--
--   * profiles and staff_invitations (on delete set null). A null branch on a
--     staff profile means BUSINESS WIDE (0023, 0059), so deleting a counter
--     with a cashier assigned would quietly promote that cashier to every
--     branch. Refused while anybody, or any invitation that can still be
--     accepted, names it.
--
--   * voucher_branches (on delete cascade). A promo code with no branch rows
--     is valid EVERYWHERE (0064), so deleting the one branch a code was held
--     to would widen the code instead of retiring it. Refused while any code
--     is scoped to it.
--
--   * audit_logs (no delete action, on purpose, per 0023). Audit rows are
--     never deleted. The rows about this branch are detached instead: their
--     branch_id becomes null, which reads as business wide, and they keep the
--     branch's id in target_id and its details in their diffs. No branch-scoped
--     reader loses anything by it, because the rules above mean nobody is
--     assigned to this branch. The deletion writes one more row holding the
--     whole branch as it was, so the trail ends with what was removed.
--
-- And the branch must already be switched off. Deleting is the last step of
-- retiring a counter, not a shortcut past the first: a live branch is listed
-- for customers and may have a pickup window being chosen right now.
--
-- What cascades is configuration only: store_hours, pickup_slots (empty,
-- since there are no orders), menu_item_branch_holds. Carts that had chosen
-- the branch fall back to choosing again (set null).
--
-- Business wide only, like adding a branch (0081).

create or replace function staff_delete_branch(p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_branch branches%rowtype;
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(null) then
    raise exception 'BUSINESS_WIDE_FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_branch_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select * into v_branch from branches where id = p_branch_id for update;
  if not found then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_branch.is_active then
    raise exception 'BRANCH_ACTIVE' using errcode = 'P0001';
  end if;
  if exists (select 1 from orders where branch_id = p_branch_id) then
    raise exception 'BRANCH_HAS_ORDERS' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where branch_id = p_branch_id)
     or exists (
       select 1 from staff_invitations
       where branch_id = p_branch_id and status = 'pending' and expires_at > now()
     ) then
    raise exception 'BRANCH_HAS_STAFF' using errcode = 'P0001';
  end if;
  if exists (select 1 from voucher_branches where branch_id = p_branch_id) then
    raise exception 'BRANCH_HAS_PROMOS' using errcode = 'P0001';
  end if;

  update audit_logs set branch_id = null where branch_id = p_branch_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    'store.branch_deleted',
    'branches',
    p_branch_id::text,
    jsonb_build_object('before', to_jsonb(v_branch) - 'image_blur_data_url'),
    null
  );

  delete from branches where id = p_branch_id;
end;
$$;

comment on function staff_delete_branch(uuid) is
  'Deletes a switched-off branch that has no orders, no staff, no pending '
  'invitations and no promo codes scoped to it. Its audit rows are kept and '
  'detached; store.branch_deleted records the whole row as it was.';

revoke execute on function staff_delete_branch(uuid) from public, anon, authenticated;
grant execute on function staff_delete_branch(uuid) to authenticated;
