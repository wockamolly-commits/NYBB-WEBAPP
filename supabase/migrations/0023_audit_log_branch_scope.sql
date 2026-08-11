-- 0023_audit_log_branch_scope.sql
-- Give the audit trail a branch dimension, so reading it can be scoped the
-- same way reading orders already is.
--
-- 0022 opened audit_logs from "admin only" to "anyone holding audit:view",
-- which by role default is every manager. It did not scope those reads by
-- branch, so a manager assigned to one site could read every site's staff
-- activity through the Data API. Orders, payments and status events are all
-- branch scoped one policy above; the trail describing them was not.
--
-- The scope is stored rather than derived. Deriving it at read time would mean
-- casting target_id and joining orders inside an RLS policy, evaluated per row
-- on every query, and it would only answer for the one target table anybody
-- had remembered to handle. A column states the fact once.
--
-- A null branch_id means business wide, not unknown: workspace access grants
-- and Super Admin provisioning are company records rather than counter
-- records. current_staff_can_access_branch(null) is already false for a
-- branch-assigned profile and true for an unassigned one, so the same
-- expression that scopes a site's rows also keeps company rows to the people
-- who are not tied to a site. That is the intended reading, not a coincidence
-- of null handling, and there is a test for it.

alter table audit_logs
  add column branch_id uuid references branches(id);

comment on column audit_logs.branch_id is
  'Which site this action belongs to. Null means business wide. No delete '
  'action on the reference on purpose: a branch with history cannot be '
  'deleted out from under its own audit trail.';

create index audit_logs_scope_idx on audit_logs (branch_id, id desc);

-- Any writer of an orders row inherits the scope without having to remember
-- it. The existing transition RPC therefore needs no restatement, and so does
-- no future one. Guarded by a regex because target_id is text and Postgres has
-- no cast that returns null instead of raising.
create or replace function audit_logs_resolve_branch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.branch_id is null
     and new.target_table = 'orders'
     and new.target_id ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    select o.branch_id into new.branch_id
    from public.orders o
    where o.id = new.target_id::uuid;
  end if;
  return new;
end;
$$;

revoke execute on function audit_logs_resolve_branch()
  from public, anon, authenticated, service_role;

create trigger audit_logs_set_branch
  before insert on audit_logs
  for each row execute function audit_logs_resolve_branch();

-- Rows written before the trigger existed. The cast lives in a materialized
-- CTE so the planner cannot lift it above the regex that makes it safe.
with candidates as materialized (
  select id, target_id::uuid as order_id
  from audit_logs
  where branch_id is null
    and target_table = 'orders'
    and target_id ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
update audit_logs a
set branch_id = o.branch_id
from candidates c
join orders o on o.id = c.order_id
where a.id = c.id;

-- The read path, in the same shape as the orders policy above it.
drop policy if exists "authorized staff read audit log" on audit_logs;
create policy "authorized staff read audit log" on audit_logs
  for select using (
    current_staff_has_permission('audit:view')
    and current_staff_can_access_branch(branch_id)
  );

-- The audit page names its actors, which is a profiles read. 0022 gated that
-- on audit:view alone, so the same widening that let a manager read another
-- site's trail also let them read another site's staff, phone numbers
-- included. Scope it identically. An admin profile carries no branch, so it
-- stays visible only to a profile that carries none either.
drop policy if exists "authorized staff read profiles" on profiles;
create policy "authorized staff read profiles" on profiles
  for select using (
    id = auth.uid()
    or (
      current_staff_has_permission('audit:view')
      and current_staff_can_access_branch(branch_id)
    )
  );
