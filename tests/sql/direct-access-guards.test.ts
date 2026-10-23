import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";

/**
 * What a caller holding only the public anon key, or a customer's own session,
 * cannot do by going around place_order. The two-unpaid-orders guard and the
 * price rules live inside that function, so they are only as strong as the
 * absence of any other way to write an order or a payment.
 */

describe("direct writes that would skip place_order", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase();
  }, 120_000);

  const privilege = (role: string, table: string, kind: string) =>
    db
      .query<{ ok: boolean }>("select has_table_privilege($1, $2, $3) as ok", [role, table, kind])
      .then((result) => result.rows[0]!.ok);

  it.each(["orders", "order_items", "payments", "pickup_slots", "checkout_attempts", "voucher_redemptions"])(
    "gives anon and a signed-in customer no insert or update on %s",
    async (table) => {
      for (const role of ["anon", "authenticated"]) {
        expect(await privilege(role, `public.${table}`, "insert")).toBe(false);
        expect(await privilege(role, `public.${table}`, "update")).toBe(false);
      }
    },
  );

  it("keeps the PayMongo event ledger and the Super Admin record to the service role", async () => {
    for (const table of ["paymongo_webhook_events", "super_admin_authority"]) {
      for (const role of ["anon", "authenticated"]) {
        for (const kind of ["select", "insert", "update", "delete"]) {
          expect(await privilege(role, `public.${table}`, kind)).toBe(false);
        }
      }
    }
    expect(await privilege("service_role", "public.paymongo_webhook_events", "insert")).toBe(true);
  });

  it("lets no signed-in session write the restricted audit copies", async () => {
    for (const kind of ["insert", "update", "delete"]) {
      expect(await privilege("authenticated", "public.audit_log_restricted_details", kind)).toBe(false);
    }
  });
});
