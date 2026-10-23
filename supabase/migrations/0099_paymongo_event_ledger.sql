-- 0099: PayMongo events recognised by their id.
--
-- PayMongo's webhook documentation says a handler "will occasionally receive
-- the same event more than once" and should "use the event ID to
-- deduplicate", calling it "a hard requirement for any handler that touches
-- financial data". Until now this one relied on the state of the row instead:
-- apply_paymongo_payment (0043, 0091) changes nothing on a second paid or
-- failed event, and apply_paymongo_refund (0033) nothing on a second settled
-- refund. That covered the money. It did not cover what the webhook does
-- after the write: a redelivered refund success told the customer twice that
-- their money was on its way, because the refund RPC returns nothing to say
-- whether it changed anything.
--
-- The webhook now writes each event's id here once it has been handled, and
-- answers a delivery whose id is already here without doing anything. An event
-- is recorded only after it was handled, so one that failed half way is still
-- retried. Two copies arriving at the same moment can both be handled; the row
-- guards above remain what makes that harmless.
--
-- Written and read by the service role only. Nobody else has a reason to.

create table paymongo_webhook_events (
  event_id text primary key check (length(event_id) between 1 and 255),
  event_type text not null,
  livemode boolean,
  processed_at timestamptz not null default now()
);

comment on table paymongo_webhook_events is
  'PayMongo webhook events already handled, by PayMongo''s event id, so a '
  'redelivery is acknowledged without being handled again. Since 0099.';

alter table paymongo_webhook_events enable row level security;

revoke all on paymongo_webhook_events from public, anon, authenticated;
grant select, insert on paymongo_webhook_events to service_role;
