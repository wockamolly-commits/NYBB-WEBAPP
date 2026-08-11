-- 0031_schedule_online_payment_expiry.sql
-- Schedule the payment expiry sweep when pg_cron is enabled in Supabase.
--
-- The function runs inside Postgres, so expiry does not depend on Vercel's
-- cron limits or an HTTP round trip. The dynamic SQL keeps local and test
-- databases without the pg_cron extension able to apply every migration.

do $body$
declare
  v_exists boolean;
begin
  if to_regclass('cron.job') is not null then
    execute
      'select exists (select 1 from cron.job where jobname = ''expire-unpaid-online-orders'')'
      into v_exists;
    if not v_exists then
      execute $sql$
        select cron.schedule(
          'expire-unpaid-online-orders',
          '*/5 * * * *',
          'select public.expire_unpaid_online_orders()'
        )
      $sql$;
    end if;
  end if;
end;
$body$;
