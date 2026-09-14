-- 0071_public_store_hours.sql
-- The weekly opening hours of every live counter, readable by a customer.
--
-- WHY THIS FUNCTION HAS TO EXIST.
--
-- `store_hours` is RLS'd to staff (0009, narrowed per branch in 0059), and
-- that is right for the table, which is where the owner edits the schedule.
-- But opening hours are painted on the shopfront. The branches page has been
-- telling customers "opening hours are not published here yet" while the
-- owner was keeping them up to date in the workspace, because nothing
-- anonymous could read what the workspace writes.
--
-- This is the read side of that and nothing more: a slug, a weekday, and the
-- window. No branch ids, no audit columns, and no row for a branch that is
-- switched off, because an inactive branch's hours are not a promise this
-- platform is making.
--
-- THE REPRESENTATION IS PASSED THROUGH, NOT INTERPRETED.
--
-- 0026 gave the columns their meaning: an equal pair on an open day is a
-- continuous 24 hours, and a close earlier than the open crosses midnight. The
-- storefront formats from those rules. Reinterpreting them here as a label
-- would give the database and the page two definitions of "open" to keep in
-- step, which is the drift branch_is_open_at exists to prevent.
--
-- Times are returned as HH:MM text. A Postgres `time` through PostgREST is
-- "10:00:00", and the seconds are a precision the editor never offers.
--
-- A weekday with no row is left out rather than returned as closed. Absent
-- means nobody has said, and the page says exactly that.

create or replace function get_store_hours()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slug', b.slug,
        'weekday', h.weekday,
        'isClosed', h.is_closed,
        'opensAt', to_char(h.opens_at, 'HH24:MI'),
        'closesAt', to_char(h.closes_at, 'HH24:MI')
      )
      order by b.sort_order, b.slug, h.weekday
    ),
    '[]'::jsonb
  )
  from branches b
  join store_hours h on h.branch_id = b.id
  where b.is_active
$$;

comment on function get_store_hours() is
  'Weekly opening hours for every active branch, for the public branches page. '
  'Equal opens/closes on an open day is 24 hours; closes before opens crosses '
  'midnight (see 0026). A weekday with no row is omitted, never reported closed.';

-- Postgres grants EXECUTE to PUBLIC by default, so a SECURITY DEFINER function
-- without this pair is callable with the definer's privileges by anybody.
revoke execute on function get_store_hours() from public;

-- Anonymous, deliberately, for the same reason as get_orderable_branches: a
-- guest reads a shop's hours before there is any question of an account.
grant execute on function get_store_hours() to anon, authenticated;
