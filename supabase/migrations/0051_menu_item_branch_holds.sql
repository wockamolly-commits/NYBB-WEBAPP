-- 0051_menu_item_branch_holds.sql
-- Marking one item sold out at one counter, and the single definition of
-- whether an item is available there.
--
-- WHY THIS IS A TABLE AND NOT TWO COLUMNS ON menu_items.
--
-- The reference is a single store, so it carries unavailability_kind and
-- unavailable_until on the item row. This platform is nine branches sharing one
-- catalog. Those columns here would mean the cashier at Central Bloc running out
-- of wings hides them at Mango Avenue too, and correcting that later is a
-- migration plus a storefront change. 0002 states the project's position on
-- exactly this: the schema carries all nine branches from day one so that
-- opening the second is a boolean, not a migration.
--
-- It also splits the two menu permissions cleanly, which one column cannot.
-- menu_items.is_active is the manager's decision, off the menu everywhere and
-- indefinitely, and needs menu:configure. A row here is the cashier's decision
-- mid shift, paused at this counter until tonight, and needs menu:availability.
--
-- THERE IS NO SWEEP.
--
-- The reference calls refresh_expired_menu_item_availability() at the top of
-- every menu page load to clear holds that have run out. Comparing the
-- timestamp inside menu_item_is_available() gets the same behaviour with no
-- cron, and with no window in which an expired hold is still hiding an item.
-- Deleting long expired rows is housekeeping and belongs to nothing here.

create table menu_item_branch_holds (
  item_id uuid not null references menu_items(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,

  -- 'today' and 'until' both carry an end and differ only in what the screen
  -- said when it was set, which is worth keeping for the audit trail.
  -- 'indefinite' has no end and is lifted by hand.
  kind text not null check (kind in ('today', 'until', 'indefinite')),
  unavailable_until timestamptz,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (item_id, branch_id),

  -- Lifting a hold deletes the row. There is deliberately no is_held boolean:
  -- a flag beside a timestamp is two states that can disagree.
  constraint hold_has_an_end check (
    kind = 'indefinite' or unavailable_until is not null
  )
);
create index menu_item_branch_holds_branch_idx on menu_item_branch_holds (branch_id);
create trigger menu_item_branch_holds_set_updated_at
  before update on menu_item_branch_holds
  for each row execute function set_updated_at();

alter table menu_item_branch_holds enable row level security;

create policy "staff read holds" on menu_item_branch_holds
  for select using (current_staff_has_permission('menu:view'));

-- Select only. The write is the RPC below, per 0022. Do not add insert, update
-- or delete here to bring a form back in a hurry.
grant select on menu_item_branch_holds to authenticated;

-- ---------------------------------------------------------------------------
-- The one definition of available.
-- ---------------------------------------------------------------------------
--
-- branch_is_open_at() is the only definition of open and every surface calls
-- it. This is the same arrangement for items: get_storefront_menu, place_order
-- and the workspace list all call this rather than comparing a timestamp
-- themselves, so the menu and the checkout gate cannot disagree.
--
-- A null branch returns true, and that is load bearing rather than sloppy.
-- get_storefront_menu is called with no branch slug before a customer has
-- picked a store. A menu that hid every item in that state would be worse than
-- one that hid none, and a hold is a fact about one counter, not about the
-- catalog.
create or replace function menu_item_is_available(
  p_item_id uuid,
  p_branch_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from menu_item_branch_holds h
    where h.item_id = p_item_id
      and h.branch_id = p_branch_id
      and (h.kind = 'indefinite' or h.unavailable_until > p_at)
  )
$$;

comment on function menu_item_is_available(uuid, uuid, timestamptz) is
  'Whether an item can be sold at a branch at a moment. The only place a hold '
  'is compared to a clock. Returns true for a null branch, which is the state '
  'the storefront is in before a customer has chosen a store.';

-- ---------------------------------------------------------------------------
-- The mid shift control.
-- ---------------------------------------------------------------------------
--
-- p_kind null lifts the hold. Anything else sets one, replacing whatever was
-- there, so a cashier extending "until 6pm" to "until 8pm" is one call.
--
-- Two checks, not one: current_staff_can_access_branch() answers which counter,
-- and it answers nothing at all about permission.
create or replace function staff_set_menu_item_hold(
  p_item_id uuid,
  p_branch_id uuid,
  p_kind text,
  p_unavailable_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_existing menu_item_branch_holds%rowtype;
  v_item_name text;
begin
  if not current_staff_has_permission('menu:availability') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_item_id is null or p_branch_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_kind is not null and p_kind not in ('today', 'until', 'indefinite') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select name into v_item_name from menu_items where id = p_item_id;
  if v_item_name is null then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- A timed hold with no end would be an indefinite one wearing the wrong
  -- label, and one that has already passed is available the instant it is set.
  -- Both are data entry slips, so refuse rather than guess which was meant.
  if p_kind in ('today', 'until') then
    if p_unavailable_until is null then
      raise exception 'HOLD_NEEDS_AN_END' using errcode = 'P0001';
    end if;
    if p_unavailable_until <= v_now then
      raise exception 'HOLD_END_IN_PAST' using errcode = 'P0001';
    end if;
  end if;

  select * into v_existing
  from menu_item_branch_holds
  where item_id = p_item_id and branch_id = p_branch_id
  for update;

  if p_kind is null then
    if not found then
      return;
    end if;
    delete from menu_item_branch_holds
    where item_id = p_item_id and branch_id = p_branch_id;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.item.released', 'menu_items', p_item_id::text,
      jsonb_build_object(
        'item_name', v_item_name,
        'before', jsonb_build_object(
          'kind', v_existing.kind,
          'unavailable_until', v_existing.unavailable_until
        )
      ),
      p_branch_id
    );
    return;
  end if;

  -- A no-op writes no audit row, matching staff_set_branch_accepting_orders.
  if found
     and v_existing.kind = p_kind
     and v_existing.unavailable_until is not distinct from p_unavailable_until then
    return;
  end if;

  insert into menu_item_branch_holds
    (item_id, branch_id, kind, unavailable_until, created_by)
  values
    (p_item_id, p_branch_id, p_kind, p_unavailable_until, v_actor_id)
  on conflict (item_id, branch_id) do update
    set kind = excluded.kind,
        unavailable_until = excluded.unavailable_until,
        created_by = excluded.created_by;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.item.held', 'menu_items', p_item_id::text,
    jsonb_build_object(
      'item_name', v_item_name,
      'before', case when v_existing.item_id is null then null else jsonb_build_object(
        'kind', v_existing.kind,
        'unavailable_until', v_existing.unavailable_until
      ) end,
      'after', jsonb_build_object(
        'kind', p_kind,
        'unavailable_until', p_unavailable_until
      )
    ),
    p_branch_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants, in the same migration that creates the functions, per 0010.
-- ---------------------------------------------------------------------------
--
-- The revoke names anon and authenticated and not only public, because
-- Supabase ships a default privilege granting execute to all three. A revoke
-- from public alone removes a privilege nobody held. See 0015.

revoke execute on function menu_item_is_available(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

-- menu_item_is_available stays internal. get_storefront_menu and place_order
-- are both SECURITY DEFINER, so inside them the effective user is the owner and
-- the call succeeds without the caller holding execute on it.
grant execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz)
  to authenticated;
