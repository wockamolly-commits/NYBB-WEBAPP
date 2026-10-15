-- 0086_audit_log_permission_rows.sql
--
-- A branch assigned manager could read every permission change in the
-- business, at every counter.
--
-- WHAT 0056 DID, AND WHAT IT MISSED.
--
-- 0056 restated the audit read policy on the owner's ruling of 2026-08-27: a
-- manager pinned to one counter sees business wide rows (the catalog, the
-- vouchers, the intake switch) and does not see rows about a person. It drew
-- that line with target_table <> 'profiles', and said why: an action list goes
-- stale the moment somebody adds an action, and the target table answers the
-- real question, which is whether a row is about a person.
--
-- 0060 shipped a week later and audited a permission override against
-- target_table = 'staff_permission_overrides', with the person's profile id as
-- the target and a null branch. That is a row about a person under a second
-- table name, and the null-branch arm of 0056 admitted it. So a manager at
-- Central Bloc read who had been handed menu:configure at every other site,
-- by whom, and when. Found on 2026-10-15 by impersonating that manager against
-- the live database: three such rows were visible.
--
-- THE FIX.
--
-- Name both tables. This is still the target table test 0056 chose, and the
-- same caveat applies to the next one: a new table that holds rows about a
-- person must be added here, and tests/sql/audit-log.test.ts is where that
-- will fail first if it is not.
--
-- Nothing changes for a business wide session. A roving manager and the Super
-- Admin carry no branch, current_staff_can_access_branch(null) is true for
-- them, and they still reach these rows through the second arm.
--
-- Restated whole, because a policy has no alter that can amend its expression.
-- The permission half is unchanged since 0023.

drop policy if exists "authorized staff read audit log" on audit_logs;
create policy "authorized staff read audit log" on audit_logs
  for select using (
    current_staff_has_permission('audit:view')
    and (
      (
        branch_id is null
        and target_table not in ('profiles', 'staff_permission_overrides')
      )
      or current_staff_can_access_branch(branch_id)
    )
  );
