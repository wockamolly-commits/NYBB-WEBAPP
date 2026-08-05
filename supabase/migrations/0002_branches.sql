-- 0002_branches.sql
-- The multi-branch spine: price lists, branches, and per-branch opening hours.
--
-- Launch is one branch. The schema carries all nine from day one with
-- is_active = false, so opening the second is a boolean, not a migration.

create table price_lists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table price_lists is
  'One catalog, many price lists. Exactly one list (hot-wings-standard) exists '
  'at launch and every branch points at it. The table is kept because the '
  'branch mix (mall food halls, a hospital kiosk, a casino outlet, four petrol '
  'forecourts) is precisely the mix where the same dish carries different '
  'prices for rent and concession reasons. The day one site needs its own '
  'prices, the change is one row and one foreign key.';

create table branches (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- "Mango Avenue". The short form used in chips, lists and on the ticket,
  -- where the full legal name does not fit.
  short_name text not null,

  -- The multi-brand seam, kept deliberately narrow. The spec drafted this as
  -- 'hot_wings' | 'sports_lounge'; the Sports Lounge closed in August 2026 and
  -- nothing in this platform may reference it, so the CHECK admits one value.
  -- Widening it later is a constraint change.
  brand text not null default 'hot_wings' check (brand = 'hot_wings'),

  -- Site format, mirroring Branch["format"] in lib/catalog/types.ts. Not
  -- decoration: a petrol forecourt, a mall food hall and a hospital kiosk have
  -- different pickup behaviour, which is why prep minutes and slot capacity
  -- below are per branch rather than global.
  format text not null check (
    format in ('street', 'mall', 'food-hall', 'petrol', 'hospital', 'casino')
  ),

  price_list_id uuid not null references price_lists(id) on delete restrict,

  address_line text not null,
  barangay text,
  city text not null,
  -- Two of the nine branches publish two numbers. The spec drafted a single
  -- phone column; an array keeps both without a second table.
  phones text[] not null default '{}',

  -- For the static map and the directions link only. Nothing routes on these:
  -- there is no delivery here and there never will be.
  lat numeric(10, 7),
  lng numeric(10, 7),
  google_place_id text,

  -- Every branch is in Asia/Manila today. The column exists so store_hours
  -- arithmetic reads a value instead of hardcoding one, which is the same
  -- mistake in miniature that put opening hours in two places in the reference.
  timezone text not null default 'Asia/Manila',

  -- The branch card photograph, written by scripts/ingest-legacy-images.ts.
  -- Only two of the nine have one; the rest render a designed empty card
  -- rather than a stock photo of somewhere they are not.
  image_url text,
  image_width int,
  image_height int,
  image_blur_data_url text,
  image_source text,

  is_active boolean not null default false,
  is_accepting_orders boolean not null default false,

  prep_minutes_default int not null default 20 check (prep_minutes_default > 0),
  -- Slot granularity and the throttle. Spec section 10, N1.
  pickup_slot_minutes int not null default 15 check (pickup_slot_minutes > 0),
  pickup_slot_capacity int not null default 6 check (pickup_slot_capacity > 0),

  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index branches_active_idx on branches (is_active, sort_order);
create index branches_price_list_idx on branches (price_list_id);
create trigger branches_set_updated_at
  before update on branches
  for each row execute function set_updated_at();

comment on column branches.is_active is
  'Seeded false for all nine. Exactly one is flipped true for the pilot. Which '
  'branch that is remains open question 1 in spec section 28 and only the '
  'owner can answer it, so the seed marks none of them.';

-- Weekly opening hours, per branch, in one place.
--
-- The reference kept hours in app_settings AND hardcoded in lib/, and the two
-- drifted. This table is the only source. There is no fallback schedule
-- anywhere in the codebase: a branch with no rows here is closed, which is the
-- correct behaviour while the real weekday hours are still an unanswered owner
-- question (spec section 28, question 2).
create table store_hours (
  branch_id uuid not null references branches(id) on delete cascade,
  -- 0 = Sunday, matching extract(dow), so the function below can compare
  -- directly without a lookup table.
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  updated_at timestamptz not null default now(),
  primary key (branch_id, weekday),
  constraint store_hours_window_present check (
    is_closed or (opens_at is not null and closes_at is not null)
  ),
  -- A window that opens and closes at the same minute is a data entry slip,
  -- not a 24-hour day. Reject it rather than guess which was meant.
  constraint store_hours_window_not_empty check (
    is_closed or opens_at <> closes_at
  )
);
create trigger store_hours_set_updated_at
  before update on store_hours
  for each row execute function set_updated_at();

comment on table store_hours is
  'closes_at earlier than opens_at means the window crosses midnight. The tail '
  'after midnight belongs to the weekday the window opened on.';

-- The one function every surface reads hours through. Storefront copy, slot
-- generation and the place_order gate all call this, so there is exactly one
-- definition of "open".
--
-- Fails closed: an unknown branch, an inactive branch, or a branch with no
-- store_hours rows is shut.
create or replace function branch_is_open_at(
  p_branch_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_timezone text;
  v_local timestamp;
  v_time time;
  v_dow smallint;
  v_row store_hours%rowtype;
begin
  select timezone into v_timezone
    from branches
    where id = p_branch_id and is_active;
  if v_timezone is null then
    return false;
  end if;

  v_local := p_at at time zone v_timezone;
  v_time := v_local::time;
  v_dow := extract(dow from v_local)::smallint;

  -- Today's window.
  select * into v_row
    from store_hours
    where branch_id = p_branch_id and weekday = v_dow;

  if found and not v_row.is_closed then
    if v_row.closes_at > v_row.opens_at then
      if v_time >= v_row.opens_at and v_time < v_row.closes_at then
        return true;
      end if;
    else
      -- Crosses midnight. Everything from opening until midnight is today's.
      if v_time >= v_row.opens_at then
        return true;
      end if;
    end if;
  end if;

  -- Yesterday's window may still be running: a Friday 18:00 to 02:00 shift is
  -- open at 01:00 on Saturday.
  select * into v_row
    from store_hours
    where branch_id = p_branch_id and weekday = ((v_dow + 6) % 7)::smallint;

  if found
    and not v_row.is_closed
    and v_row.closes_at < v_row.opens_at
    and v_time < v_row.closes_at
  then
    return true;
  end if;

  return false;
end;
$$;
