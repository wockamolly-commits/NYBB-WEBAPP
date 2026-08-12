# PayMongo payment deployment

Phase 1b uses QR Ph first. The checkout never offers counter payment. The `counter` enum value and
its staff-side compatibility branches remain for historical data and migration safety, but pickup
checkout is prepay only.

## Required configuration

Set these in the Vercel Preview and Production environments, and keep the secret values out of git:

- `PAYMONGO_SECRET_KEY`
- `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`
- `PAYMONGO_WEBHOOK_SECRET`
- `CRON_SECRET` (only for manually running the expiry endpoint)
- `NEXT_PUBLIC_SITE_URL`

## Local mock payments

To test the complete workflow without PayMongo credentials, set
`MOCK_PAYMENTS_ENABLED=true` in `.env.local`. This switch is ignored in production.

The development database must still use the existing online-payment flags so the
database takes the same QR Ph order path:

```sql
update app_settings
set paymongo_enabled = true,
    paymongo_methods = '{"qrph": true, "gcash": false, "maya": false, "card": false}'::jsonb
where id = 1;
```

Checkout then displays a development payment simulation with success and failure buttons. A success
calls the same payment reconciliation RPC as a signed webhook. A failure cancels the order and
releases its pickup slot immediately. To test expiry and slot release, place another order and leave
its payment untouched. Manager refunds of a completed mock payment settle immediately through the
same refund reconciliation RPC, and support full and partial amounts. Never enable this switch in a
deployed production environment.

Apply migrations in numeric order through `0033_staff_refunds.sql`. Migration `0031_schedule_online_payment_expiry.sql` schedules
`expire_unpaid_online_orders()` every five minutes when the Supabase project has `pg_cron` enabled,
`0032` cancels an order immediately when PayMongo reports a failed payment, and `0033` adds
permission-gated, audit-logged PayMongo refunds. On a new project,
enable `pg_cron` before applying `0031`:

```sql
create extension if not exists pg_cron;
```

Verify the job after migration:

```sql
select jobid, schedule, command, active
from cron.job
where jobname = 'expire-unpaid-online-orders';
```

The guarded `GET /api/cron/expire-orders` endpoint is only a manual test and recovery trigger. It
requires `Authorization: Bearer <CRON_SECRET>`. It is not scheduled through Vercel.

## PayMongo webhook

Create a test webhook endpoint at:

```text
https://<deployment>/api/paymongo/webhook
```

Subscribe it to `payment.paid`, `payment.failed`, `payment.refunded`, and `payment.refund.updated`.
Use the signing secret from that endpoint as
`PAYMONGO_WEBHOOK_SECRET`. The handler verifies the raw request body before parsing it. An order
stays pending and is absent from the kitchen board until the signed `payment.paid` event reaches the
database.

## Test-mode checklist

1. Enable only `qrph` in `app_settings.paymongo_methods` and set `paymongo_enabled` to true.
2. Place an order, scan the QR code in PayMongo test mode, and wait for `payment.paid`.
3. Confirm the payment is paid and the order appears on the staff board.
4. Place another order without paying. Age its `placed_at`, then call the manual endpoint or wait
   for the five-minute sweep. Confirm the order is cancelled and its slot is released.
5. Deliver a late paid test webhook. Confirm the order remains cancelled and `payments.needs_refund`
   is true.
6. As a manager, open order history and issue a full or partial refund. Confirm the refund reservation
   is audit-logged, and that the customer tracking page shows `Refunded` after PayMongo confirms it.
