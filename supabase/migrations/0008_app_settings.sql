-- 0008_app_settings.sql
-- Global settings and feature flags, the rate limiter, vouchers, and the
-- franchise inquiry form.

-- Singleton. Everything here is genuinely global; anything that varies by
-- branch lives on branches or store_hours instead.
--
-- Note what is NOT here: opening hours. The reference kept them in its
-- app_settings AND hardcoded in lib/, and the two drifted until nobody could
-- say which was authoritative. Hours live in store_hours, per branch, full
-- stop. Prep minutes and slot capacity are per branch for the same reason: a
-- petrol forecourt and a mall food hall do not cook at the same speed.
create table app_settings (
  id int primary key default 1 check (id = 1),

  -- The master switch. False stops order placement everywhere, regardless of
  -- branch hours, and is checked inside place_order rather than only in the UI.
  accepting_orders boolean not null default true,

  -- Minutes an order may sit in ready before the sweep flags it. Unpaid ones
  -- then auto-cancel and release their pickup slot; prepaid ones stay open and
  -- surface in a "Needs attention" banner, because that is somebody's money.
  no_show_after_minutes int not null default 45 check (no_show_after_minutes > 0),

  -- How long an unpaid online order holds its slot before expiring.
  online_payment_expiry_minutes int not null default 15
    check (online_payment_expiry_minutes > 0),

  -- How far ahead the slot picker offers windows.
  slot_horizon_hours int not null default 8 check (slot_horizon_hours > 0),

  -- Feature flags. Every integration is dark by default. The branch picker
  -- exists, is built, and is hidden: flipping multi_branch_enabled in front of
  -- an audience is a better demonstration of the roadmap than a slide is.
  multi_branch_enabled boolean not null default false,
  zenpos_enabled boolean not null default false,
  paymongo_enabled boolean not null default false,
  vouchers_enabled boolean not null default false,
  loyalty_enabled boolean not null default false,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,

  updated_at timestamptz not null default now()
);
create trigger app_settings_set_updated_at
  before update on app_settings
  for each row execute function set_updated_at();

insert into app_settings (id) values (1);

-- The storefront's only view of app_settings.
--
-- The table itself is locked to staff (0009) and carries no anon grant (0010).
-- The reference locked its equivalent and then spent a day on customer-facing
-- reads that silently returned no row instead of failing, because RLS denies
-- by returning nothing. Rather than reach for a service-role client on a
-- public page, the storefront calls this and gets exactly the flags it needs.
create or replace function get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'accepting_orders', s.accepting_orders,
    'multi_branch_enabled', s.multi_branch_enabled,
    'paymongo_enabled', s.paymongo_enabled,
    'vouchers_enabled', s.vouchers_enabled,
    'slot_horizon_hours', s.slot_horizon_hours
  )
  from app_settings s
  where s.id = 1
$$;

-- The one gate that answers "can this branch take an order right now".
-- Storefront copy, the slot picker and place_order all call it, so the UI and
-- the transaction can never disagree about whether the shop is open.
create or replace function branch_accepts_orders(
  p_branch_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce((select accepting_orders from app_settings where id = 1), false)
    and exists (
      select 1 from branches b
      where b.id = p_branch_id
        and b.is_active
        and b.is_accepting_orders
    )
    and branch_is_open_at(p_branch_id, p_at)
$$;

-- Fixed-window rate limiter, Postgres-backed. No extra infrastructure to run,
-- and it is reachable from the same transaction as the thing it protects.
create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);
create index rate_limits_window_start_idx on rate_limits (window_start);

-- A single atomic upsert: rolls the window when stale, otherwise increments.
-- Returns true while the caller is within the limit and false once it is
-- exceeded. The on-conflict row lock means concurrent hits on one key cannot
-- miscount.
--
-- Callers must fail OPEN on an exception from this function. A limiter that
-- takes ordering down with it has done more damage than the abuse it prevents.
create or replace function rate_limit_hit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
          when rate_limits.window_start
               < v_now - make_interval(secs => p_window_seconds)
          then 1
          else rate_limits.count + 1
        end,
        window_start = case
          when rate_limits.window_start
               < v_now - make_interval(secs => p_window_seconds)
          then v_now
          else rate_limits.window_start
        end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Vouchers.
--
-- The tables land now, ahead of the code that uses them, and that ordering is
-- a hard rule inherited from the reference: applying half the voucher schema
-- fails open, showing a discount on screen while charging the customer full
-- price. vouchers_enabled stays false until the whole path ships.
create table vouchers (
  id uuid primary key default gen_random_uuid(),
  -- Case-insensitive in practice: the app upper-cases before lookup and the
  -- unique index below is on the upper-cased value.
  code text not null,
  -- Exactly one of the two is set. A fixed amount is the launch instrument;
  -- percentage exists because promo copy is written in percentages.
  amount_cents bigint check (amount_cents is null or amount_cents > 0),
  percent_off int check (percent_off is null or (percent_off between 1 and 100)),
  -- Null = anyone, a promo code. Set = that customer only, a loyalty reward.
  owner_user_id uuid references auth.users(id) on delete cascade,
  -- Null = never expires. Every paper card carries a date and so should this;
  -- the admin UI requires one for promo codes.
  expires_at timestamptz,
  -- Null = unlimited.
  max_uses int check (max_uses is null or max_uses > 0),
  max_uses_per_customer int not null default 1 check (max_uses_per_customer > 0),
  min_order_cents bigint not null default 0 check (min_order_cents >= 0),
  is_active boolean not null default true,
  -- Free text for the owner: "launch week", "8-stamp reward".
  note text,
  created_at timestamptz not null default now(),
  constraint vouchers_one_discount_kind check (
    (amount_cents is not null and percent_off is null)
    or (amount_cents is null and percent_off is not null)
  )
);
create unique index vouchers_code_key on vouchers (upper(code));

create table voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references vouchers(id) on delete restrict,
  order_id uuid not null references orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  amount_cents bigint not null check (amount_cents >= 0),
  redeemed_at timestamptz not null default now()
);
create index voucher_redemptions_voucher_idx on voucher_redemptions (voucher_id);
create index voucher_redemptions_order_idx on voucher_redemptions (order_id);

-- The order carries the voucher it used, so the tracking page and the receipt
-- do not have to join through redemptions to name the discount.
alter table orders
  add column voucher_id uuid references vouchers(id) on delete set null;

comment on column orders.discount_cents is
  'Resolved server-side from the vouchers row. The client sends a code and '
  'nothing else: any discount amount arriving from a client is ignored.';

-- The current WordPress site earns franchise leads from a form. Replacing that
-- site must not lose them.
create table franchise_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  city text,
  message text,
  -- Rate limited and honeypotted rather than CAPTCHA'd: a CAPTCHA on a lead
  -- form costs more leads than the spam does.
  source_ip inet,
  user_agent text,
  handled_at timestamptz,
  handled_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index franchise_inquiries_created_idx on franchise_inquiries (created_at desc);
create index franchise_inquiries_open_idx on franchise_inquiries (handled_at)
  where handled_at is null;
