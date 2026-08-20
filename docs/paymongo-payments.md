# PayMongo payment deployment

Phase 1b uses QR Ph first. The checkout never offers counter payment. The `counter` enum value and
its staff-side compatibility branches remain for historical data and migration safety, but pickup
checkout is prepay only.

## Required configuration

Three values, and all three are required together. Two of them make a payment possible and the
third makes it confirmable, which is why the deployment refuses to offer online payment unless it
holds every one (`lib/paymongo/config.ts`).

- `PAYMONGO_SECRET_KEY`, `sk_test_...` or `sk_live_...`
- `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`, `pk_test_...` or `pk_live_...`
- `PAYMONGO_WEBHOOK_SECRET`, the signing secret of the endpoint registered below
- `NEXT_PUBLIC_SITE_URL`, the canonical origin PayMongo returns the customer to
- `CRON_SECRET`, only for manually running the expiry endpoint

**A key IS its mode.** The prefix is the only place `test` or `live` is written, and PayMongo
accepts each half of a mismatched pair on its own, so a test secret beside a live public key is two
working credentials for two different accounts. Startup logs the mismatch and checkout offers
nothing rather than creating an intent in an account the payment will never reach.

**A missing webhook secret is the expensive failure, not the cheap one.** The customer pays, the
signed `payment.paid` event arrives, `verifyPaymongoSignature` cannot verify it, the handler answers
400, the counter never hears about the order, and the five-minute sweep cancels it while the money
sits with PayMongo. There is no error anywhere the customer or the counter can see. So the rail
stays closed until this value exists.

## Connecting a PayMongo account

Do this once per mode: once with the test keys, and again with the live keys when the business is
ready to charge real money. Webhooks are scoped to the key that created them, so a test endpoint
never receives a live event and going live needs a second endpoint.

**1. Read the keys out of the PayMongo dashboard.** Developers, API Keys. Start in test mode.

**2. Put them in `.env.local`.** Secret values belong in that file and in the Vercel environment,
and nowhere else. Never in git, never pasted into a chat.

```
PAYMONGO_SECRET_KEY=sk_test_...
NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY=pk_test_...
```

**3. Turn the simulator off, or the real keys are ignored.** `startPayment` checks
`MOCK_PAYMENTS_ENABLED` before it reaches PayMongo, so leaving it true means every local payment is
still simulated no matter how correct the keys are. Set `MOCK_PAYMENTS_ENABLED=false` to exercise
the real test-mode rail.

**4. Register the webhook and capture its signing secret.**

```bash
node scripts/paymongo.mjs webhook:create https://<deployment>/api/paymongo/webhook
```

It subscribes the four events this application reconciles, writes
`PAYMONGO_WEBHOOK_SECRET` into `.env.local`, and prints only a masked confirmation. **PayMongo
returns a signing secret once, at creation.** If that value is lost the endpoint has to be read from
the dashboard or replaced. Pass `--show` to print it when you need to copy it into Vercel by hand.

The URL must be publicly reachable, so `localhost` will not do. Point a test-mode endpoint at the
Vercel preview deployment, or at a tunnel to the development machine.

**5. Check what the deployment now believes.**

```bash
node scripts/paymongo.mjs check
```

It reports each value masked, refuses a swapped or mismatched pair, proves the secret key by making
a real authenticated call, and lists the account's webhooks with any missing events named.

**6. Set the same three values in Vercel, in both the Preview and Production scopes.** Then
**redeploy.** Vercel captures the environment when a deployment is created, so changing a variable
changes nothing until a new build exists. This applies to the server-side names as well as the
`NEXT_PUBLIC_` one. Two other things are decided at build time from
`NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY`: the `*.paymongo.com` image host in `next.config.ts` that the QR
image is served from, and the PayMongo origins in the Content Security Policy. Without the redeploy
the QR code is blocked rather than displayed.

**7. Confirm the owner's switch is on in the database.** The keys say this deployment CAN take QR
Ph; `app_settings` says the business WANTS to. Both are required.

```sql
select paymongo_enabled, paymongo_methods from app_settings where id = 1;
```

**8. Run the test-mode checklist below**, end to end, before touching live keys.

**9. Going live.** Swap both keys for their `sk_live_`/`pk_live_` counterparts, create a second
webhook with the live secret key (step 4 again, against the production URL), replace
`PAYMONGO_WEBHOOK_SECRET` with the new endpoint's secret, and redeploy. `verifyPaymongoSignature`
reads the live signature (`li=`) rather than the test one (`te=`) purely from the secret key's
prefix, so the key and the endpoint must change together or every event is rejected.

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
