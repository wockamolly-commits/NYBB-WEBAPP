-- 0028_rename_central_bloc_branch.sql
-- Rename the existing pilot branch without changing its stable slug or UUID.
-- Keeping those identifiers preserves orders, staff assignments, hours, and
-- every other branch-scoped relationship already attached to this row.

update branches
set
  name = 'NYBB Hot Wings, Central Bloc',
  short_name = 'Central Bloc, IT Park',
  address_line = 'Central Bloc, Cebu IT Park, Lahug'
where slug = 'garden-bloc';
