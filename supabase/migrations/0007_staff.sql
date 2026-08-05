-- 0007_staff.sql
-- Accounts, permissions, and the trails: notifications, audit, push.
--
-- Two account classes with two separate cookie namespaces in the app. A staff
-- member signed into the workspace is a guest on the storefront, deliberately.
-- That surprised the reference team and produced a false "cart sync is broken"
-- bug report, so it is written down in the README as well as here.

-- Operations accounts, one to one with a Supabase auth user.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- The broad account class, and the only thing RLS policies read.
  role user_role not null,
  -- The assigned job, which supplies a default permission set that
  -- staff_permission_overrides then adjusts per person.
  staff_role staff_role,
  display_name text not null,
  phone text,
  -- Which counter this person works. Null means every branch, which is what an
  -- admin gets. Staff reads are scoped by this once multi-branch is on.
  branch_id uuid references branches(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_staff_role_matches_class check (
    (role = 'admin' and staff_role is null)
    or (role = 'staff' and staff_role is not null)
  )
);
create index profiles_role_idx on profiles (role);
create index profiles_branch_idx on profiles (branch_id);
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Customer accounts. Separate table from profiles on purpose: a customer is
-- not a staff member with fewer permissions, and conflating them means one bad
-- policy hands the orders board to the public.
create table customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customer_profiles_set_updated_at
  before update on customer_profiles
  for each row execute function set_updated_at();

-- Now that profiles exists, attach the foreign keys the earlier migrations
-- left dangling.
alter table orders
  add constraint orders_accepted_by_fk
  foreign key (accepted_by_profile_id) references profiles(id),
  add constraint orders_claimed_by_fk
  foreign key (claimed_by_profile_id) references profiles(id);

alter table order_status_events
  add constraint order_status_events_actor_fk
  foreign key (actor_profile_id) references profiles(id);

alter table payments
  add constraint payments_recorded_by_fk
  foreign key (recorded_by_profile_id) references profiles(id);

alter table pos_sync
  add constraint pos_sync_entered_by_fk
  foreign key (entered_by) references profiles(id);

create table staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  -- An invitation can never mint an admin. The Super Admin is bootstrapped
  -- from SUPER_ADMIN_EMAIL and there is no in-app path to a second one.
  role user_role not null default 'staff' check (role = 'staff'),
  staff_role staff_role not null default 'cashier',
  branch_id uuid references branches(id) on delete set null,
  -- The token itself is never stored, only its hash, so a leaked database
  -- backup does not hand out workspace accounts.
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  invited_by_profile_id uuid not null references profiles(id),
  accepted_by_profile_id uuid references profiles(id),
  -- 48 hours, set by the caller.
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index staff_invitations_email_idx on staff_invitations (lower(email));
create index staff_invitations_status_idx on staff_invitations (status, expires_at);

-- Per-person permission forcing. The job role supplies defaults; a row here
-- pins one permission on or off for one person. resolvePermissions() in the
-- app composes the two. Kept as rows rather than a jsonb blob so that granting
-- one person one extra capability is an insert, and revoking it is a delete.
create table staff_permission_overrides (
  profile_id uuid not null references profiles(id) on delete cascade,
  permission text not null,
  granted boolean not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  primary key (profile_id, permission)
);

create table notifications (
  id bigserial primary key,
  channel text not null check (channel in ('push', 'email')),
  target text not null,
  template text not null,
  payload jsonb not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  -- Set when a worker picks the row up, so a retry sweep can tell "in flight"
  -- from "stuck" without a second table.
  sending_started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index notifications_status_idx on notifications (status, created_at);

create table audit_logs (
  id bigserial primary key,
  actor_profile_id uuid references profiles(id),
  action text not null,
  target_table text not null,
  target_id text,
  diff jsonb,
  ip inet,
  ua text,
  created_at timestamptz not null default now()
);
create index audit_logs_target_idx on audit_logs (target_table, target_id);
create index audit_logs_actor_idx on audit_logs (actor_profile_id, created_at desc);

-- Web Push, self-hosted VAPID. Two audiences: the customer waiting for the
-- ready notification, which is the entire value proposition of ordering ahead,
-- and the counter tablet waiting for a new order.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('customer', 'staff')),
  -- Staff subscriptions belong to a profile. Customer subscriptions belong to
  -- an order code, because a guest has no account to hang them off.
  profile_id uuid references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_audience_target check (
    (audience = 'staff' and profile_id is not null)
    or (audience = 'customer' and profile_id is null)
  )
);

-- Which orders a customer endpoint is following. A device that orders twice in
-- an evening keeps one subscription and gains a second row here.
create table push_subscription_orders (
  endpoint text not null
    references push_subscriptions(endpoint) on delete cascade,
  order_code text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (endpoint, order_code)
);

-- The authorization primitive. Every SECURITY DEFINER function and every staff
-- RLS policy reads this and nothing else, so there is one answer to "who is
-- this" rather than one per policy.
--
-- Returns null for guests, for customers, and for a deactivated staff account.
-- Deactivation is therefore immediate and total: it does not wait for a token
-- to expire, which is the point of re-checking the role from the database on
-- every workspace request rather than trusting the JWT.
create or replace function current_role_kind()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select staff_role from profiles where id = auth.uid() and is_active
$$;

-- Sugar over current_role_kind(), so policies read as prose and a future third
-- account class is one edit rather than forty.
create or replace function is_staff()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_role_kind() in ('staff', 'admin')
$$;

create or replace function is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_role_kind() = 'admin'
$$;
