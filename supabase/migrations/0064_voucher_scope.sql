-- 0064_voucher_scope.sql
-- The shape a voucher needs before it can be more than a flat promo code:
-- where it applies, who may hold it, when it opens, and how many uses are left.
--
-- THIS MIGRATION AND 0065 BOTH LAND BEFORE THE CODE THAT READS THEM.
--
-- Inherited as a hard rule from the reference and restated at 0008:150, which
-- is where the vouchers tables were created for exactly this reason. Applying
-- half the voucher schema fails open: the screen shows a discount and the
-- customer is charged full price. app_settings.vouchers_enabled stays false
-- until the whole path is live, and the flag is the only thing that turns it
-- on. Spec section 18.
--
-- WHAT WAS ALREADY HERE, AND WHY SO LITTLE OF IT CHANGES.
--
-- 0008 created vouchers and voucher_redemptions, added orders.voucher_id, and
-- documented orders.discount_cents as resolved server side. 0009 enabled RLS on
-- both and 0022 pointed their read policies at vouchers:manage. None of that is
-- touched. What is added is the scope model, a start date, a discount cap, and
-- the usage counter that makes the cap safe under concurrency.
--
-- EMPTY MEANS EVERYWHERE.
--
-- The four scope tables below are all opt in. A voucher with no rows in
-- voucher_branches is valid at every counter; one with no rows in
-- voucher_items is valid on the whole menu. The alternative, a scope column
-- naming a kind, cannot express the ordinary case of a code limited to two
-- branches AND to one category, and it would make the common promo code, which
-- is limited by nothing, the one that has to be configured. This way the simple
-- voucher is the empty one.
--
-- THE NULLABLE COLUMNS ARE LOAD BEARING, ALL OF THEM.
--
-- amount_cents null means a percentage voucher. max_uses null means unlimited.
-- expires_at null means never. starts_at null, added here, means live from the
-- moment it is created. max_discount_cents null, added here, means uncapped.
-- owner_user_id null means anyone. Not one of them means zero, and reading any
-- of them with z.coerce.number() in the app would turn "no cap" into "capped at
-- nothing" and disable the voucher silently. AGENTS.md rule 6, and spec section
-- 18 names max_uses as the most dangerous of them, because 0 is a plausible
-- looking cap that nothing downstream would flag.

-- ---------------------------------------------------------------------------
-- 1. One definition of a phone number's digits.
-- ---------------------------------------------------------------------------
--
-- place_order has computed this inline since 0013 to key its rate limiter
-- (0052:332). The per-customer voucher cap counts on the same value, because
-- most orders here are placed by guests and the account is null on them, so the
-- number is the only identity a second order can be recognised by. It is also
-- what the returning-customer figure in 0062 counts on, which is the reason to
-- reuse it rather than invent a second normalisation: two rules for what makes
-- the same customer would disagree, and the disagreement would show up as a
-- promo cap that holds in analytics and leaks at checkout.
--
-- Named normalize_phone_digits rather than phone_digits because
-- voucher_redemptions grows a phone_digits column below, and a function and a
-- column sharing a name is legal here and confusing to read.
create or replace function normalize_phone_digits(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '')
$$;

comment on function normalize_phone_digits(text) is
  'A phone number reduced to its digits, which is how this schema recognises '
  'the same customer across guest orders. The same expression place_order has '
  'used for its rate limit key since 0013.';

-- Not granted to anon, though a guest's order does count through it. Both
-- callers, place_order and preview_voucher in 0065, are SECURITY DEFINER and
-- run as the owner, so the caller never needs this itself, and a guest holding
-- execute on it would be a grant nothing uses.
revoke execute on function normalize_phone_digits(text) from public, anon, authenticated;
grant execute on function normalize_phone_digits(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. What a voucher carries that it did not.
-- ---------------------------------------------------------------------------
alter table vouchers
  -- Shown to the customer when the code is applied, so "LAUNCH50" arrives on
  -- the checkout screen as something they can recognise. note is the owner's
  -- own scratch text from 0008 and stays private to the workspace.
  add column description text,
  -- Null = live from creation. A code printed for a campaign that starts on
  -- Monday can be created on Friday and refuses itself until then.
  add column starts_at timestamptz,
  -- Null = uncapped. Only meaningful beside percent_off: a ceiling on a fixed
  -- amount is the fixed amount.
  add column max_discount_cents bigint
    check (max_discount_cents is null or max_discount_cents > 0),
  -- The redemption counter. Kept on the row rather than derived from
  -- count(voucher_redemptions) because a count cannot be constrained, and the
  -- constraint below is the entire concurrency guarantee.
  add column uses_count int not null default 0 check (uses_count >= 0);

alter table vouchers
  add constraint vouchers_start_before_expiry check (
    starts_at is null or expires_at is null or starts_at < expires_at
  );

-- THE CONCURRENCY GUARD, AND IT IS A CONSTRAINT RATHER THAN A CHECK IN CODE.
--
-- The same device place_order already uses for pickup capacity: 0005 puts a
-- CHECK on pickup_slots.reserved against capacity, and 0052:471 increments
-- through it and catches check_violation, because "read the count, then decide"
-- is two statements a second transaction fits between. Here the increment
-- `update vouchers set uses_count = uses_count + 1` takes a row lock, so every
-- concurrent redemption of one voucher serialises on it, and the loser is
-- refused by this constraint rather than by a stale read.
--
-- max_uses null keeps its meaning: null is unlimited, and a null on either side
-- of the comparison makes the check pass, so an uncapped voucher is unaffected.
alter table vouchers
  add constraint vouchers_within_max_uses check (
    max_uses is null or uses_count <= max_uses
  );

comment on column vouchers.uses_count is
  'Redemptions currently held against this voucher, maintained by place_order '
  'and by the return trigger in 0065. Constrained against max_uses, which is '
  'what makes the cap hold when two customers check out at once.';

comment on column vouchers.starts_at is
  'Null means live immediately. Never default this on read: a null replaced by '
  'now() would make every scheduled voucher already open.';

comment on column vouchers.max_discount_cents is
  'The ceiling on a percentage discount. Null means uncapped, and must not be '
  'read as zero, which would discount nothing on every percentage voucher.';

-- ---------------------------------------------------------------------------
-- 3. Scope. Four tables, all of them meaning nothing when empty.
-- ---------------------------------------------------------------------------
create table voucher_branches (
  voucher_id uuid not null references vouchers(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  primary key (voucher_id, branch_id)
);

create table voucher_items (
  voucher_id uuid not null references vouchers(id) on delete cascade,
  item_id uuid not null references menu_items(id) on delete cascade,
  primary key (voucher_id, item_id)
);

create table voucher_categories (
  voucher_id uuid not null references vouchers(id) on delete cascade,
  category_id uuid not null references menu_categories(id) on delete cascade,
  primary key (voucher_id, category_id)
);

-- Two ways to name a customer, because this platform has two kinds.
--
-- A signed-in customer is an auth.users row. A guest is a phone number and
-- nothing else, and guests are most of the orders here, so a restriction list
-- that only understood accounts would be unusable for the case the owner
-- actually has. Exactly one column is set per row, which keeps "who is this row
-- about" a question with one answer.
--
-- Distinct from vouchers.owner_user_id, which stays what 0008 and spec section
-- 19 made it: the loyalty instrument, one voucher belonging to one account,
-- issued by the system rather than typed by an admin. A voucher may carry both,
-- and then both have to pass.
create table voucher_customers (
  voucher_id uuid not null references vouchers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  phone_digits text,
  constraint voucher_customer_names_one_identity check (
    (user_id is not null and phone_digits is null)
    or (user_id is null and phone_digits is not null)
  )
);
create unique index voucher_customers_user_key
  on voucher_customers (voucher_id, user_id) where user_id is not null;
create unique index voucher_customers_phone_key
  on voucher_customers (voucher_id, phone_digits) where phone_digits is not null;

-- ---------------------------------------------------------------------------
-- 4. What a redemption records.
-- ---------------------------------------------------------------------------
--
-- 0008 recorded the voucher, the order, the customer, the discount and the
-- time. The rest is what the owner asks of a usage report and cannot recover
-- later: the counter it was used at, the number it was used by, and the two
-- money figures either side of the discount. The point of a redemption row is
-- to be the record of what happened at the moment it happened, so it carries
-- its own copies rather than joining back to an order that can later be
-- refunded, rejected or repriced.
alter table voucher_redemptions
  add column branch_id uuid references branches(id) on delete set null,
  add column phone_digits text,
  add column subtotal_cents bigint check (subtotal_cents is null or subtotal_cents >= 0),
  add column total_cents bigint check (total_cents is null or total_cents >= 0);

-- ONE VOUCHER PER ORDER, AS A CONSTRAINT RATHER THAN AS A PROMISE.
--
-- The stacking rule the brief asks for is that vouchers never combine. Written
-- as a check inside place_order it would be a rule somebody can forget the day
-- a second write path appears. Written here it is a shape the database cannot
-- hold: a second redemption for one order has nowhere to go.
create unique index voucher_redemptions_order_key on voucher_redemptions (order_id);

-- The per-customer cap counts through these. Both are partial, because a
-- redemption carries an account or a number and rarely both.
create index voucher_redemptions_customer_phone_idx
  on voucher_redemptions (voucher_id, phone_digits) where phone_digits is not null;
create index voucher_redemptions_customer_user_idx
  on voucher_redemptions (voucher_id, user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Row level security and grants.
-- ---------------------------------------------------------------------------
--
-- Select only, for the same reason 0051 gives: every write is an RPC in 0065
-- that checks the permission itself. A customer never selects from any of these
-- tables at all, the scope tables included, because knowing which items a code
-- covers is most of knowing the code is worth having. They send a code and the
-- server answers.
--
-- New tables need explicit grants or they return 42501. Spec section 22 item 2.
alter table voucher_branches enable row level security;
alter table voucher_items enable row level security;
alter table voucher_categories enable row level security;
alter table voucher_customers enable row level security;

create policy "authorized staff read voucher branches" on voucher_branches
  for select using (current_staff_has_permission('vouchers:manage'));
create policy "authorized staff read voucher items" on voucher_items
  for select using (current_staff_has_permission('vouchers:manage'));
create policy "authorized staff read voucher categories" on voucher_categories
  for select using (current_staff_has_permission('vouchers:manage'));
create policy "authorized staff read voucher customers" on voucher_customers
  for select using (current_staff_has_permission('vouchers:manage'));

grant select on voucher_branches, voucher_items, voucher_categories, voucher_customers
  to authenticated;

-- Matching 0022, which revoked every write on vouchers from authenticated and
-- left the reads to the policy above. Stated rather than assumed, so a later
-- reader does not have to work out whether the new tables were missed.
revoke insert, update, delete
  on voucher_branches, voucher_items, voucher_categories, voucher_customers
  from authenticated;
