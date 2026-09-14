-- 0072_store_hours_realtime.sql
-- A change signal for the public branches page when opening hours are saved.
--
-- WHY A SIGNAL AND NOT POSTGRES CHANGES.
--
-- The branches page is read by anonymous visitors, and `store_hours` is RLS'd
-- to staff (0009, 0059). Realtime's Postgres Changes feed applies that RLS, so
-- an anonymous subscriber would receive nothing, and widening the table's
-- policy to make it work would publish the table itself. This is the 0021
-- pattern instead: a trigger sends a payload with no row data to a public
-- Broadcast topic, and the page re-reads the hours through get_store_hours()
-- (0071), which stays the only authority for what a customer is shown.
--
-- WHY STATEMENT LEVEL.
--
-- staff_set_store_hours writes a week as an upsert of seven rows and a delete,
-- so a row trigger would send up to fourteen identical signals for one Save.
-- One per statement is at most two, and the page coalesces those into a single
-- refresh.
--
-- WHY branches TOO.
--
-- get_store_hours returns hours for active branches only, and the page shows
-- whether a counter is open now from get_orderable_branches. Switching a
-- branch on or off, or renaming it, changes what the modal should say just as
-- surely as editing a time does.

create or replace function broadcast_store_hours_changed()
returns trigger
language plpgsql
security definer
-- As 0022 set for the order tracking trigger: it needs pg_catalog and the
-- explicitly qualified realtime.send, and nothing else.
set search_path = pg_catalog
as $$
begin
  perform realtime.send(
    jsonb_build_object('changed', true),
    'changed',
    'store-hours',
    false
  );
  return null;
end;
$$;

revoke execute on function broadcast_store_hours_changed()
  from public, anon, authenticated, service_role;

create trigger store_hours_broadcast_changed
  after insert or update or delete on store_hours
  for each statement
  execute function broadcast_store_hours_changed();

create trigger branches_broadcast_changed
  after update on branches
  for each statement
  execute function broadcast_store_hours_changed();

comment on function broadcast_store_hours_changed() is
  'Signals the public store-hours Broadcast topic after opening hours or a '
  'branch change. The payload contains no data; the page re-reads '
  'get_store_hours().';
