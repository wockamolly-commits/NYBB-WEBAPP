import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const STAFF_ID = "73000000-0000-4000-8000-000000000001";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email)
    values ('${STAFF_ID}', 'manager@example.com');
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${STAFF_ID}'::uuid $$;

    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    update app_settings set
      paymongo_enabled = true,
      paymongo_methods = '{"qrph": true, "gcash": false, "maya": false, "card": false}'::jsonb
    where id = 1;
    insert into profiles (id, role, staff_role, display_name)
    values ('${STAFF_ID}', 'staff', 'manager', 'Manager');
  `);
  return db;
}

async function addPaidOrder(db: PGlite, code: string, amountCents = 32900, branch = "pilot") {
  const orderId = await scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents
    )
    select '${code}', 'cancelled', b.id, b.price_list_id, '2468',
           'Customer', '09170000000', ${amountCents}
    from branches b where b.slug = '${branch}'
    returning id::text
  `);
  await db.exec(`
    insert into payments (
      order_id, method, provider, status, amount_cents, provider_payment_id, needs_refund
    ) values ('${orderId}', 'qrph', 'paymongo', 'paid', ${amountCents}, 'pay_${code}', true)
  `);
  return orderId;
}

async function requestRefund(
  db: PGlite,
  orderId: string,
  amountCents: number | null = null,
) {
  return scalar<string>(
    db,
    `select staff_request_refund(
      '${orderId}',
      ${amountCents === null ? "null" : amountCents},
      'requested_by_customer',
      'Customer asked us to return the payment'
    )->>'refund_id'`,
  );
}

describe("staff refunds", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("exposes reservation to staff, while keeping reconciliation service-role only", async () => {
    expect(await scalar<boolean>(db, `select has_function_privilege(
      'authenticated', 'staff_request_refund(uuid, bigint, text, text)', 'execute'
    )`)).toBe(true);
    for (const role of ["anon", "authenticated"] as const) {
      expect(await scalar<boolean>(db, `select has_function_privilege(
        '${role}', 'apply_paymongo_refund(uuid, text, text, jsonb, text)', 'execute'
      )`)).toBe(false);
    }
  });

  it("reserves and settles a full refund exactly once", async () => {
    const orderId = await addPaidOrder(db, "NY-REFULL");
    const refundId = await requestRefund(db, orderId);

    expect(await scalar<string>(db, `select status::text from refunds where id = '${refundId}'`)).toBe("pending");
    await db.exec(`select apply_paymongo_refund(
      '${refundId}', 'ref_full', 'succeeded', '{"event":"refund.updated"}'::jsonb
    )`);
    expect(await scalar<string>(db, `select status::text from refunds where id = '${refundId}'`)).toBe("succeeded");
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("refunded");
    expect(await scalar<boolean>(db, `select needs_refund from payments where order_id = '${orderId}'`)).toBe(false);
    expect(await scalar<number>(db, `select count(*)::int from audit_logs where target_id = '${refundId}'`)).toBe(2);
    await expect(requestRefund(db, orderId)).rejects.toThrow(/REFUND_PAYMENT_NOT_PAID/);
  });

  it("keeps the payment paid after a partial refund and caps the remaining amount", async () => {
    const orderId = await addPaidOrder(db, "NY-REFPART", 32900);
    const firstRefundId = await requestRefund(db, orderId, 10000);
    await db.exec(`select apply_paymongo_refund('${firstRefundId}', 'ref_part_1', 'succeeded')`);
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("paid");

    await expect(requestRefund(db, orderId, 23000)).rejects.toThrow(/REFUND_EXCEEDS_PAYMENT/);
    const secondRefundId = await requestRefund(db, orderId, 22900);
    await db.exec(`select apply_paymongo_refund('${secondRefundId}', 'ref_part_2', 'succeeded')`);
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("refunded");
  });

  it("releases a failed refund reservation so staff can safely try again", async () => {
    const orderId = await addPaidOrder(db, "NY-REFFAIL");
    const refundId = await requestRefund(db, orderId);
    await db.exec(`select apply_paymongo_refund(
      '${refundId}', 'ref_failed', 'failed', null, 'Provider declined this refund'
    )`);
    expect(await scalar<string>(db, `select status::text from refunds where id = '${refundId}'`)).toBe("failed");
    await expect(requestRefund(db, orderId, 32900)).resolves.toBeTruthy();
  });

  it("enforces refund permission and assigned branch scope", async () => {
    const orderId = await addPaidOrder(db, "NY-REFDENY");
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${STAFF_ID}', 'refunds:manage', false)
    `);
    await expect(requestRefund(db, orderId)).rejects.toThrow(/FORBIDDEN/);
    await db.exec(`update staff_permission_overrides set granted = true
      where profile_id = '${STAFF_ID}' and permission = 'refunds:manage'`);
    await db.exec(`update profiles set branch_id = (select id from branches where slug = 'pilot')
      where id = '${STAFF_ID}'`);
    const otherOrderId = await addPaidOrder(db, "NY-REFBRAN", 32900, "other");
    await expect(requestRefund(db, otherOrderId)).rejects.toThrow(/FORBIDDEN/);
  });
});
