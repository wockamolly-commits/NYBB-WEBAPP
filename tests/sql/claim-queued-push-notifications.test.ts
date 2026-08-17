import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * `claim_queued_push_notifications` (0041) exists to make claiming atomic. Its
 * caller, `lib/push/drain.ts`, was deleted with the mobile app on 2026-08-17,
 * because the queue it drained could only ever be delivered over Expo. **The
 * function is still applied in production and this test still earns its place**:
 * the expiry sweep keeps filling the queue, and a customer web push would drain
 * it through this same claim.
 *
 * The property under test is that two overlapping drains cannot take the same
 * row. A mocked unit test cannot prove a `for update skip locked` claim actually
 * behaves that way under concurrency. This is that proof, as far as PGlite can
 * give one.
 *
 * What this cannot prove: PGlite serializes every query and transaction
 * through a single mutex (see BasePGlite's "run a function exclusively, no
 * other transactions or queries will be allowed" in its own type
 * definitions), so there is no way to hold two overlapping transactions open
 * against this harness at once. What is tested here is the sequential
 * correctness the claim depends on: a row leaves 'queued' the instant it is
 * claimed, so a second caller (real concurrent or merely a second call)
 * cannot see it as 'queued' again. `for update skip locked` is what turns
 * that same guarantee into "skip past" instead of "block behind" once a
 * second session really is running at the same time in production; that half
 * is asserted by reading the migration, not by this file.
 */

async function setup() {
  return freshDatabase();
}

async function queueRow(
  db: PGlite,
  target: string,
  { channel = "push", status = "queued" }: { channel?: string; status?: string } = {},
) {
  return scalar<number>(
    db,
    `
      insert into notifications (channel, target, template, payload, status)
      values ('${channel}', '${target}', 'order_cancelled_expired',
              jsonb_build_object('order_id', gen_random_uuid()), '${status}')
      returning id::int
    `,
  );
}

describe("claim_queued_push_notifications", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("claims the oldest queued push rows up to the limit and marks them sending", async () => {
    const first = await queueRow(db, "NY-AAA111");
    const second = await queueRow(db, "NY-BBB222");
    await queueRow(db, "NY-CCC333");

    const claimed = await db.query<{ id: number; status: string; sending_started_at: string | null; attempts: number }>(
      `select id, status, sending_started_at, attempts
       from claim_queued_push_notifications(2) order by id`,
    );

    expect(claimed.rows.map((r) => r.id)).toEqual([first, second]);
    for (const row of claimed.rows) {
      expect(row.status).toBe("sending");
      expect(row.sending_started_at).not.toBeNull();
      expect(row.attempts).toBe(1);
    }
    // The third row was never asked for and must be untouched.
    expect(
      await scalar<string>(db, `select status from notifications where target = 'NY-CCC333'`),
    ).toBe("queued");
  });

  it("does not claim a row that is already sending", async () => {
    await queueRow(db, "NY-DDD444", { status: "sending" });
    const claimed = await db.query(`select id from claim_queued_push_notifications(10)`);
    expect(claimed.rows).toHaveLength(0);
  });

  it("does not claim an email row, even if it is queued", async () => {
    await queueRow(db, "NY-EEE555", { channel: "email" });
    const claimed = await db.query(`select id from claim_queued_push_notifications(10)`);
    expect(claimed.rows).toHaveLength(0);
  });

  it("does not reclaim a row a prior call already took", async () => {
    await queueRow(db, "NY-FFF666");
    const firstCall = await db.query(`select id from claim_queued_push_notifications(10)`);
    expect(firstCall.rows).toHaveLength(1);

    const secondCall = await db.query(`select id from claim_queued_push_notifications(10)`);
    expect(secondCall.rows).toHaveLength(0);
    expect(
      await scalar<number>(db, `select attempts::int from notifications where target = 'NY-FFF666'`),
    ).toBe(1);
  });

  it("hands a second call the rows left over, not the first call's rows again", async () => {
    const a = await queueRow(db, "NY-GGG777");
    const b = await queueRow(db, "NY-HHH888");
    const c = await queueRow(db, "NY-III999");
    const d = await queueRow(db, "NY-JJJ000");

    const firstBatch = (
      await db.query<{ id: number }>(`select id from claim_queued_push_notifications(2) order by id`)
    ).rows.map((r) => r.id);
    expect(firstBatch).toEqual([a, b]);

    const secondBatch = (
      await db.query<{ id: number }>(`select id from claim_queued_push_notifications(2) order by id`)
    ).rows.map((r) => r.id);
    // The rows left over after the first claim, and none of the first
    // batch's ids: a caller that claims twice must never see the same row
    // land in both batches.
    expect(secondBatch).toEqual([c, d]);
    expect(secondBatch.some((id) => firstBatch.includes(id))).toBe(false);
  });

  it("defaults the limit to 50 when none is given", async () => {
    for (let i = 0; i < 3; i += 1) {
      await queueRow(db, `NY-DEF${i}`);
    }
    const claimed = await db.query(`select id from claim_queued_push_notifications()`);
    expect(claimed.rows).toHaveLength(3);
  });
});

describe("the grant boundary", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("exposes the claim only to service_role", async () => {
    const check = async (role: string) =>
      scalar<boolean>(
        db,
        `select has_function_privilege('${role}', 'claim_queued_push_notifications(integer)', 'execute')`,
      );
    expect(await check("anon")).toBe(false);
    expect(await check("authenticated")).toBe(false);
    expect(await check("service_role")).toBe(true);
  });
});
