-- 0098: promo codes in the audit log, readable only with promo code access.
--
-- The owner's ruling of 2026-08-27 (0056) lets a branch manager read the
-- business wide audit rows, voucher changes among them, and that stands. What
-- it also let them read was the code itself: every voucher.create and
-- voucher.update row carries the whole voucher, code included, in `diff`. A
-- manager without vouchers:manage cannot open the promo code screen, and could
-- still read every code there is from the audit log. The owner's decision of
-- 2026-10-21: they keep the entries, they lose the codes. Enforced here rather
-- than on the screen, because the audit_logs policy is what decides what a
-- session can read, and a screen that hid the code would leave it one direct
-- query away.
--
-- HOW.
--
-- RLS chooses rows, not values, so the code cannot stay in a row the manager
-- can read. It moves out:
--
--   * audit_logs.diff keeps the entry with the code replaced by '[restricted]'.
--   * audit_log_restricted_details holds the entry's full diff, readable under
--     its own policy: vouchers:manage, AND the caller can read the audit row
--     itself (the subquery runs under audit_logs' own policy, so this can
--     narrow access and never widen it).
--
-- A BEFORE INSERT trigger on audit_logs does the split, so every writer is
-- covered, including the next one somebody adds. What counts as a promo code:
-- the `code` key anywhere in a row about the vouchers table, and a
-- `voucher_code` key in any row. `code` alone is not masked elsewhere, because
-- menu items and options carry their own menu code (0068), which is not a
-- secret.
--
-- Existing rows are split the same way at the end. Nothing is lost: the full
-- diff moves to the restricted table before the visible one is masked.

create table audit_log_restricted_details (
  audit_log_id bigint primary key
    references audit_logs (id) on delete cascade
    -- The trigger writes this row before the audit row it belongs to exists,
    -- so the check waits for the end of the transaction.
    deferrable initially deferred,
  diff jsonb not null
);

comment on table audit_log_restricted_details is
  'The full diff of an audit entry whose visible diff had promo codes masked. '
  'Readable with vouchers:manage, and only for audit rows the caller can read. Since 0098.';

alter table audit_log_restricted_details enable row level security;

revoke all on audit_log_restricted_details from public, anon, authenticated;
grant select on audit_log_restricted_details to authenticated;
grant select on audit_log_restricted_details to service_role;

create policy "promo code managers read restricted audit detail"
  on audit_log_restricted_details
  for select to authenticated
  using (
    current_staff_has_permission('vouchers:manage')
    and exists (select 1 from audit_logs a where a.id = audit_log_id)
  );

create or replace function audit_mask_promo_codes(p_value jsonb, p_mask_code boolean)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_out jsonb;
  v_key text;
  v_entry jsonb;
begin
  if p_value is null then
    return null;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    v_out := '{}'::jsonb;
    for v_key, v_entry in select key, value from jsonb_each(p_value) loop
      if (v_key in ('voucher_code', 'voucherCode') or (p_mask_code and v_key = 'code'))
         and jsonb_typeof(v_entry) <> 'null'
      then
        v_out := v_out || jsonb_build_object(v_key, '[restricted]');
      else
        v_out := v_out || jsonb_build_object(v_key, public.audit_mask_promo_codes(v_entry, p_mask_code));
      end if;
    end loop;
    return v_out;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(public.audit_mask_promo_codes(element, p_mask_code) order by position), '[]'::jsonb)
      into v_out
    from jsonb_array_elements(p_value) with ordinality as items(element, position);
    return v_out;
  end if;

  return p_value;
end;
$$;

comment on function audit_mask_promo_codes(jsonb, boolean) is
  'An audit diff with every promo code replaced by [restricted]: voucher_code '
  'keys always, code keys when p_mask_code (a row about the vouchers table). Since 0098.';

create or replace function audit_logs_restrict_promo_codes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_masked jsonb;
begin
  if new.diff is null then
    return new;
  end if;

  v_masked := public.audit_mask_promo_codes(new.diff, new.target_table = 'vouchers');
  if v_masked is distinct from new.diff then
    insert into public.audit_log_restricted_details (audit_log_id, diff)
    values (new.id, new.diff);
    new.diff := v_masked;
  end if;
  return new;
end;
$$;

revoke execute on function audit_logs_restrict_promo_codes()
  from public, anon, authenticated, service_role;

create trigger audit_logs_restrict_promo_codes
  before insert on audit_logs
  for each row execute function audit_logs_restrict_promo_codes();

-- The rows written before this migration. The restricted copy first, then the
-- mask, so the original never exists only in a transaction that could fail.
insert into audit_log_restricted_details (audit_log_id, diff)
select a.id, a.diff
from audit_logs a
where a.diff is not null
  and audit_mask_promo_codes(a.diff, a.target_table = 'vouchers') is distinct from a.diff
on conflict (audit_log_id) do nothing;

update audit_logs a
   set diff = audit_mask_promo_codes(a.diff, a.target_table = 'vouchers')
 where exists (
   select 1 from audit_log_restricted_details r where r.audit_log_id = a.id
 );

revoke execute on function audit_mask_promo_codes(jsonb, boolean)
  from public, anon, authenticated;
