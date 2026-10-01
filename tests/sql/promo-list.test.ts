import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";

/**
 * Tests over list_customer_promos, migration 0074.
 *
 * This is the only read in the whole engine that volunteers a code nobody
 * typed, so the tests that matter most are the ones about what it refuses to
 * say. 0009 kept the code space unscrapeable by giving customers no select on
 * vouchers at all, and 0073 reopens exactly one row at a time through
 * `publicise`. Most of what is below is proof that the hole is that narrow:
 * an unticked code is invisible, somebody else's reward is invisible, and a
 * voucher that names a guest by phone is invisible to everybody including the
 * guest, because resolving it would answer "does this phone number have a
 * discount" for any number a caller cared to try.
 */

const ALICE = "77000000-0000-4000-8000-000000000001";
const BOB = "77000000-0000-4000-8000-000000000002";

/** Runs as one signed-in customer. */
async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${id}'::uuid $$;
    set role authenticated;
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

/** Runs as a guest, which is most of this shop's traffic. */
async function asGuest<T>(db: PGlite, sql: string): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select null::uuid $$;
    set role anon;
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

type Promo = {
  code: string;
  description: string | null;
  amountCents: number | null;
  percentOff: number | null;
  maxDiscountCents: number | null;
  minOrderCents: number;
  expiresAt: string | null;
  personal: boolean;
  itemNames: string[];
  categoryNames: string[];
  branchNames: string[];
};

async function listAsUser(db: PGlite, id: string, slug: string | null = null): Promise<Promo[]> {
  const arg = slug === null ? "null" : `'${slug}'`;
  const rows = await asUser<{ promos: Promo[] }>(
    db,
    id,
    `select list_customer_promos(${arg}) as promos`,
  );
  return rows[0].promos;
}

async function listAsGuest(db: PGlite, slug: string | null = null): Promise<Promo[]> {
  const arg = slug === null ? "null" : `'${slug}'`;
  const rows = await asGuest<{ promos: Promo[] }>(
    db,
    `select list_customer_promos(${arg}) as promos`,
  );
  return rows[0].promos;
}

function codes(promos: Promo[]): string[] {
  return promos.map((p) => p.code).sort();
}

/**
 * One voucher, described by the columns this function actually reads. Every
 * default here is the permissive one, so a test names only the column it is
 * about and the reason a row is absent is never ambiguous.
 */
async function voucher(
  db: PGlite,
  code: string,
  over: Record<string, string> = {},
): Promise<void> {
  const cols: Record<string, string> = {
    code: `'${code}'`,
    description: `'A promo called ${code}'`,
    amount_cents: "5000",
    percent_off: "null",
    min_order_cents: "0",
    is_active: "true",
    publicise: "true",
    starts_at: "null",
    expires_at: "null",
    max_uses: "null",
    uses_count: "0",
    owner_user_id: "null",
    ...over,
  };
  await db.exec(`
    insert into vouchers (${Object.keys(cols).join(", ")})
    values (${Object.values(cols).join(", ")});
  `);
}

async function world(): Promise<PGlite> {
  const db = await freshDatabase({ seed: true });
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ALICE}', 'alice@example.com'),
      ('${BOB}', 'bob@example.com');
    update app_settings set vouchers_enabled = true where id = 1;
  `);
  return db;
}

describe("the flag is the authority", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("says nothing at all while the engine is dark", async () => {
    // Not an error, and not a different error from "no promos". A caller
    // learns nothing, not even that the feature exists.
    await db.exec("update app_settings set vouchers_enabled = false where id = 1");
    await voucher(db, "LAUNCH50");
    expect(await listAsGuest(db)).toEqual([]);
  });

  it("lists a live publicised promo once the switch is on", async () => {
    await voucher(db, "LAUNCH50");
    expect(codes(await listAsGuest(db))).toEqual(["LAUNCH50"]);
  });
});

describe("what a stranger may not see", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("hides a code nobody ticked, which is the default and the old behaviour", async () => {
    await voucher(db, "QUIET50", { publicise: "false" });
    expect(await listAsGuest(db)).toEqual([]);
  });

  it("hides somebody else's loyalty reward even when it is ticked", async () => {
    await voucher(db, "ALICEONLY", { owner_user_id: `'${ALICE}'` });
    expect(await listAsGuest(db)).toEqual([]);
    expect(await listAsUser(db, BOB)).toEqual([]);
  });

  it("hides a ticked code that names particular customers", async () => {
    await voucher(db, "NAMED50");
    await db.exec(`
      insert into voucher_customers (voucher_id, user_id)
      select id, '${ALICE}' from vouchers where code = 'NAMED50';
    `);
    expect(await listAsGuest(db)).toEqual([]);
    expect(await listAsUser(db, BOB)).toEqual([]);
  });

  it("never resolves a voucher that names a guest by phone, for anybody", async () => {
    // The enumeration argument in 0074's header. A phone number is a dense,
    // guessable identifier and a list keyed on one would answer questions
    // about people rather than about codes. The holder was told the code out
    // of band and types it at checkout, which still works.
    await voucher(db, "PHONE50");
    await db.exec(`
      insert into voucher_customers (voucher_id, phone_digits)
      select id, '9171234567' from vouchers where code = 'PHONE50';
    `);
    expect(await listAsGuest(db)).toEqual([]);
    expect(await listAsUser(db, ALICE)).toEqual([]);
  });
});

describe("what its owner may see", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("shows a reward to the account that holds it, ticked or not", async () => {
    // A loyalty reward its holder cannot see is a reward that was never
    // issued, so the publicise gate does not apply to it.
    await voucher(db, "ALICEREWARD", {
      publicise: "false",
      owner_user_id: `'${ALICE}'`,
    });
    const mine = await listAsUser(db, ALICE);
    expect(codes(mine)).toEqual(["ALICEREWARD"]);
    expect(mine[0].personal).toBe(true);
  });

  it("shows a named customer their own code and marks it personal", async () => {
    await voucher(db, "FORALICE", { publicise: "false" });
    await db.exec(`
      insert into voucher_customers (voucher_id, user_id)
      select id, '${ALICE}' from vouchers where code = 'FORALICE';
    `);
    const mine = await listAsUser(db, ALICE);
    expect(codes(mine)).toEqual(["FORALICE"]);
    expect(mine[0].personal).toBe(true);
  });

  it("marks a public promo as not personal", async () => {
    await voucher(db, "LAUNCH50");
    const promos = await listAsUser(db, ALICE);
    expect(promos[0].personal).toBe(false);
  });
});

describe("a listed code is a live code", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("hides one that is switched off", async () => {
    await voucher(db, "OFF50", { is_active: "false" });
    expect(await listAsGuest(db)).toEqual([]);
  });

  it("hides one that has expired", async () => {
    await voucher(db, "GONE50", { expires_at: "now() - interval '1 hour'" });
    expect(await listAsGuest(db)).toEqual([]);
  });

  it("hides one that has not started", async () => {
    await voucher(db, "SOON50", { starts_at: "now() + interval '1 day'" });
    expect(await listAsGuest(db)).toEqual([]);
  });

  it("hides one that has been used up", async () => {
    await voucher(db, "SPENT50", { max_uses: "2", uses_count: "2" });
    expect(await listAsGuest(db)).toEqual([]);
  });

  it("treats a null cap as unlimited rather than as zero", async () => {
    // AGENTS.md rule 6, as a query rather than as a parse. Reading max_uses
    // as 0 here would hide every open promo on the day it was created.
    await voucher(db, "OPEN50", { max_uses: "null", uses_count: "9999" });
    expect(codes(await listAsGuest(db))).toEqual(["OPEN50"]);
  });

  it("keeps one whose window is open at both ends", async () => {
    await voucher(db, "NOW50", {
      starts_at: "now() - interval '1 hour'",
      expires_at: "now() + interval '1 hour'",
    });
    expect(codes(await listAsGuest(db))).toEqual(["NOW50"]);
  });
});

describe("a promo the customer has already had", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
    await db.exec(`
      update branches set is_active = true
      where slug in (select slug from branches order by slug limit 1);
    `);
  });

  /**
   * An order that redeemed the code, as place_order would have written it.
   *
   * The short code counts up across every call rather than restarting at the
   * loop index, because two calls for one voucher would otherwise mint the
   * same code twice and trip orders_short_code_key.
   */
  let orderSeq = 0;
  async function redeemed(code: string, userId: string | null, n = 1): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      orderSeq += 1;
      const shortCode = `RD${String(orderSeq).padStart(4, "0")}`;
      const owner = userId === null ? "null" : `'${userId}'`;
      await db.exec(`
        insert into orders (
          short_code, branch_id, price_list_id, pickup_code,
          customer_name, customer_phone, user_id
        )
        select '${shortCode}', b.id, b.price_list_id,
               '${String(orderSeq).padStart(4, "0")}',
               'Customer', '09170000000', ${owner}
        from branches b where b.is_active order by b.slug limit 1;

        insert into voucher_redemptions (voucher_id, order_id, user_id, amount_cents)
        select v.id, o.id, ${owner}, 5000
        from vouchers v, orders o
        where v.code = '${code}' and o.short_code = '${shortCode}';
      `);
    }
  }

  it("stops advertising it once they have spent their allowance", async () => {
    await voucher(db, "ONCE50");
    expect(codes(await listAsUser(db, ALICE))).toEqual(["ONCE50"]);
    await redeemed("ONCE50", ALICE);
    expect(await listAsUser(db, ALICE)).toEqual([]);
  });

  it("keeps advertising it to everybody else", async () => {
    // A redemption is one person's, and hiding a promo from the whole shop
    // because one customer took it would be a much worse fault than the one
    // this filter fixes.
    await voucher(db, "ONCE50");
    await redeemed("ONCE50", ALICE);
    expect(codes(await listAsUser(db, BOB))).toEqual(["ONCE50"]);
    expect(codes(await listAsGuest(db))).toEqual(["ONCE50"]);
  });

  it("keeps advertising a multi-use promo until the allowance is gone", async () => {
    // THE REASON THIS IS NOT "ONCE USED", which is what was asked for. Hiding
    // a three-visit promo after the first visit takes away two uses the
    // customer still holds, and the advert is where they would have learned
    // they had them.
    await voucher(db, "THRICE50", { max_uses_per_customer: "3" });
    await redeemed("THRICE50", ALICE, 1);
    expect(codes(await listAsUser(db, ALICE))).toEqual(["THRICE50"]);
    await redeemed("THRICE50", ALICE, 2);
    expect(await listAsUser(db, ALICE)).toEqual([]);
  });

  it("gives the promo back when the order that spent it falls over", async () => {
    // 0065 returns a use by DELETING the redemption row, so this filter
    // self corrects and an unpaid order that expired never counted.
    await voucher(db, "ONCE50");
    await redeemed("ONCE50", ALICE);
    expect(await listAsUser(db, ALICE)).toEqual([]);
    await db.exec(`
      delete from voucher_redemptions
      where voucher_id = (select id from vouchers where code = 'ONCE50');
    `);
    expect(codes(await listAsUser(db, ALICE))).toEqual(["ONCE50"]);
  });

  it("does not hide a promo from a guest, who has no account to count", async () => {
    // A guest redemption carries no user_id, so this filter cannot see it.
    // Deliberate: a listing has no phone to count by and must never ask for
    // one. The storefront cookie covers that browser, and checkout still
    // refuses the guest with VOUCHER_CUSTOMER_LIMIT.
    await voucher(db, "ONCE50");
    await redeemed("ONCE50", null);
    expect(codes(await listAsGuest(db))).toEqual(["ONCE50"]);
  });
});

describe("the counter", () => {
  let db: PGlite;
  let slugs: string[];

  beforeEach(async () => {
    db = await world();
    // The seed ships all nine counters is_active = false, because which one is
    // the pilot was open question 1 in spec section 28 when it was written.
    // resolve_pickup_branch_id only ever returns an active branch, so without
    // this every slug below would resolve to null and these tests would pass
    // by not filtering at all.
    await db.exec(`
      update branches set is_active = true
      where slug in (select slug from branches order by slug limit 2);
    `);
    const rows = await db.query<{ slug: string }>(
      "select slug from branches where is_active order by slug",
    );
    slugs = rows.rows.map((r) => r.slug);
    await voucher(db, "ANYWHERE50");
    await voucher(db, "FIRSTONLY");
    await db.exec(`
      insert into voucher_branches (voucher_id, branch_id)
      select v.id, b.id from vouchers v, branches b
      where v.code = 'FIRSTONLY' and b.slug = '${slugs[0]}';
    `);
  });

  it("does not narrow the list when no counter has been chosen", async () => {
    // The trap this guards. resolve_pickup_branch_id(null) answers with the
    // first active branch, so filtering on it here would quietly decide the
    // counter for somebody who has chosen nothing, which is the exact thing
    // the /stores picker exists to stop.
    expect(codes(await listAsGuest(db, null))).toEqual(["ANYWHERE50", "FIRSTONLY"]);
  });

  it("treats an unknown slug as no choice rather than as no promos", async () => {
    // A stale cookie must not empty the page.
    expect(codes(await listAsGuest(db, "not-a-branch"))).toEqual([
      "ANYWHERE50",
      "FIRSTONLY",
    ]);
  });

  it("keeps an unscoped promo and a matching one at the chosen counter", async () => {
    expect(codes(await listAsGuest(db, slugs[0]))).toEqual(["ANYWHERE50", "FIRSTONLY"]);
  });

  it("drops a promo scoped to a different counter", async () => {
    expect(codes(await listAsGuest(db, slugs[1]))).toEqual(["ANYWHERE50"]);
  });

  it("names the counter a scoped promo belongs to, so the card can say so", async () => {
    const promos = await listAsGuest(db, slugs[0]);
    const scoped = promos.find((p) => p.code === "FIRSTONLY");
    expect(scoped?.branchNames).toHaveLength(1);
  });
});

describe("the shape of what comes back", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("carries exactly the keys the storefront needs and no others", async () => {
    await voucher(db, "LAUNCH50", { description: `'Fifty off'` });
    const promos = await listAsGuest(db);
    expect(Object.keys(promos[0]).sort()).toEqual(
      [
        "amountCents",
        "branchNames",
        "categoryNames",
        "code",
        "description",
        "expiresAt",
        "placed",
        "itemNames",
        "maxDiscountCents",
        "minOrderCents",
        "percentOff",
        "personal",
        "posterBlurDataUrl",
        "posterHeight",
        "posterUrl",
        "posterWidth",
      ].sort(),
    );
  });

  it("never leaks the owner's private columns", async () => {
    await voucher(db, "LAUNCH50");
    const keys = Object.keys((await listAsGuest(db))[0]);
    // note is the owner's scratch text. The three counters are other
    // people's behaviour, and a remaining-uses figure on a public page is a
    // scarcity pattern as well as a leak.
    for (const forbidden of [
      "id",
      "note",
      "owner_user_id",
      "ownerUserId",
      "uses_count",
      "usesCount",
      "max_uses",
      "maxUses",
      "maxUsesPerCustomer",
      "sortExpires",
      "sortPriority",
      "display_priority",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("hands a percentage promo its percentage and a null amount", async () => {
    // The rule 6 shape, at the boundary. A coalesce in the SQL would turn
    // this into a fixed discount of PHP 0.00 on a public page.
    await voucher(db, "TENOFF", {
      amount_cents: "null",
      percent_off: "10",
      max_discount_cents: "8000",
    });
    const promo = (await listAsGuest(db))[0];
    expect(promo.amountCents).toBeNull();
    expect(promo.percentOff).toBe(10);
    expect(promo.maxDiscountCents).toBe(8000);
  });

  it("leaves an uncapped percentage promo's ceiling null rather than zero", async () => {
    await voucher(db, "TENOFF", {
      amount_cents: "null",
      percent_off: "10",
      max_discount_cents: "null",
    });
    expect((await listAsGuest(db))[0].maxDiscountCents).toBeNull();
  });

  it("leaves a never-expiring promo's expiry null", async () => {
    await voucher(db, "FOREVER50");
    expect((await listAsGuest(db))[0].expiresAt).toBeNull();
  });

  it("puts the soonest expiry first and the endless ones last", async () => {
    await voucher(db, "ENDLESS");
    await voucher(db, "SOONEST", { expires_at: "now() + interval '1 day'" });
    await voucher(db, "LATER", { expires_at: "now() + interval '9 days'" });
    const promos = await listAsGuest(db);
    expect(promos.map((p) => p.code)).toEqual(["SOONEST", "LATER", "ENDLESS"]);
  });
});

describe("who may call it", () => {
  it("is reachable by a guest and by a signed-in customer, and by nobody else", async () => {
    const db = await world();
    const rows = await db.query<{ grantee: string }>(`
      select grantee from information_schema.routine_privileges
      where routine_name = 'list_customer_promos' and privilege_type = 'EXECUTE'
    `);
    expect(rows.rows.map((r) => r.grantee).sort()).toEqual(
      ["anon", "authenticated", "postgres"].sort(),
    );
  });
});
