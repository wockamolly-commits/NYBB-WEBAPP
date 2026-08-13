-- 0041_claim_queued_push_notifications.sql
-- Claim queued notifications without a race.
--
-- 0039 has expire_unpaid_online_orders queue a row instead of sending, because
-- it runs on pg_cron and cannot call out over HTTP. Something still has to
-- drain that queue: lib/push/drain.ts, called from the cron route and also
-- triggerable by hand, so two drains can run at the same time.
--
-- That means claiming a row has to be atomic. supabase-js has no way to
-- express "update the oldest N queued rows, skipping whatever another
-- transaction already has locked" through PostgREST: an update's filters are
-- literal comparisons, not a correlated subquery, so there is no way to
-- attach an order and a limit to it at all, and even where a client can bolt
-- `order`/`limit` query params onto a PATCH, PostgREST does not add
-- `for update skip locked` to the row selection behind it, so two overlapping
-- drains could each select the same queued rows before either commits and
-- send the customer the same notification twice. An unbounded
-- `update ... where status = 'queued'` would avoid that race (Postgres
-- rechecks the where clause when a blocked update resumes) but hands one slow
-- drain the entire backlog, which is its own problem.
--
-- So the claim moves into Postgres, where `for update skip locked` is
-- available: this reserves up to p_limit queued push rows for the caller and
-- makes every other concurrent caller skip past them, atomically, in one
-- statement.

create or replace function claim_queued_push_notifications(p_limit integer default 50)
returns setof public.notifications
language sql
security definer
set search_path = pg_catalog
as $$
  update public.notifications
  set status = 'sending',
      sending_started_at = now(),
      attempts = attempts + 1
  where id in (
    select id from public.notifications
    where status = 'queued' and channel = 'push'
    order by id
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

revoke execute on function claim_queued_push_notifications(integer)
  from public, anon, authenticated;
grant execute on function claim_queued_push_notifications(integer)
  to service_role;
