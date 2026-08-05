-- 0006_payments.sql
-- Payments, checkout idempotency, and the POS sync surface.

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  method payment_method not null,
  provider payment_provider not null default 'manual',
  status payment_status not null default 'due',
  amount_cents bigint not null check (amount_cents >= 0),

  provider_intent_id text,
  provider_source_id text,
  provider_payment_id text,
  -- Free-text reference for the counter path: an OR number, a terminal slip.
  reference text,

  paid_at timestamptz,
  recorded_by_profile_id uuid,
  raw_webhook jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One payment per order. The reference learned this the hard way: a retried
-- intent produced a second row, and every money query then had to guess which
-- one counted. A refund is a status change on this row, not a new row.
create unique index payments_order_id_key on payments (order_id);
create index payments_provider_intent_idx on payments (provider_intent_id);
create index payments_status_idx on payments (status, created_at desc);
create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

comment on column payments.status is
  'due = pay at the counter, expected in person, not chasing. pending = an '
  'online intent awaiting its webhook, which expires and releases a pickup '
  'slot. Collapsing the two loses the distinction the orders board needs.';

-- Idempotent checkout. The client generates a uuid before the first attempt
-- and sends the same one on every retry, so a double-tapped Place Order button
-- or a Server Action replayed by a flaky connection produces one order.
--
-- The row is inserted first with a null order_id, then completed. The CHECK
-- keeps those two columns honest: a finished attempt has both, an in-flight
-- one has neither.
create table checkout_attempts (
  id uuid primary key,
  actor_kind text not null check (actor_kind in ('customer', 'guest', 'staff')),
  actor_id uuid,
  order_id uuid unique references orders(id) on delete cascade,
  result jsonb,
  created_at timestamptz not null default now(),
  check ((order_id is null) = (result is null))
);
create index checkout_attempts_created_idx on checkout_attempts (created_at);

-- Replaces the reference's loyverse_sync. Same job, adapter-shaped.
--
-- ZenPOS advertises no API, no webhooks and no developer documentation, so the
-- only adapter that exists on day one is manual_rekey: a member of staff types
-- the ticket into the POS and marks it entered. The row is created regardless
-- of adapter, so the "was this in the POS" question has one answer and the
-- double-entry guard has something to check.
create table pos_sync (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  adapter text not null check (adapter in ('manual_rekey', 'zenpos')),
  state text not null default 'pending'
    check (state in ('pending', 'sent', 'acked', 'failed', 'manual')),
  -- The ZenPOS ticket id, when there is ever an API that returns one.
  external_ref text,
  request_payload jsonb,
  response_payload jsonb,
  attempts int not null default 0 check (attempts >= 0),
  last_error text,
  -- Who re-keyed it, and when. This pair is the entire audit story for the
  -- manual path, and it is what the "Mark as entered in POS" guard reads.
  entered_by uuid,
  entered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_sync_manual_entry_complete check (
    (entered_by is null) = (entered_at is null)
  )
);
create index pos_sync_state_idx on pos_sync (state, created_at);
create trigger pos_sync_set_updated_at
  before update on pos_sync
  for each row execute function set_updated_at();
