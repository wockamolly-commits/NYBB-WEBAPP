import { describe, expect, it } from "vitest";
import { phoneLines, voucherFormInput, voucherRpcPayload } from "@/lib/vouchers/form";
import { voucherFormSchema } from "@/lib/vouchers/schema";

/**
 * The glue between the voucher form and the database.
 *
 * THIS FILE EXISTS BECAUSE A TOGGLE SHIPPED THAT COULD NEVER SAVE. `publicise`
 * had a control, a column, an RPC argument and passing SQL tests, and every
 * save still wrote false, because the Server Action builds both mapping
 * objects field by field and the new field was in neither. Two defaults,
 * `z.boolean().default(false)` and `coalesce(..., false)` in 0073, each
 * supplied a value nobody chose.
 *
 * So the tests that matter most here are the two structural ones. Asserting
 * that `publicise` survives would fix today's bug and leave the trap set for
 * whoever adds the next field; asserting that EVERY field survives is the
 * thing that closes it.
 */

function form(values: Record<string, string | string[]> = {}): FormData {
  const data = new FormData();
  const defaults: Record<string, string | string[]> = {
    code: "LAUNCH50",
    discountKind: "fixed",
    amountPesos: "50",
    maxUsesPerCustomer: "1",
    isActive: "true",
    ...values,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (Array.isArray(value)) {
      for (const one of value) data.append(key, one);
    } else {
      data.set(key, value);
    }
  }
  return data;
}

function parsed(values: Record<string, string | string[]> = {}) {
  const result = voucherFormSchema.safeParse(voucherFormInput(form(values)));
  if (!result.success) {
    throw new Error(`fixture did not parse: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

describe("every field the schema declares is read off the form", () => {
  it("leaves nothing behind", () => {
    // THE REGRESSION GUARD. A field added to the schema and forgotten in the
    // mapping does not fail to compile, because a field with a default is
    // optional in the schema's INPUT type. This is the only thing that
    // notices.
    //
    // `voucherFormSchema` is a pipe, because it ends in `.transform()`, so the
    // declared fields live on its input side rather than on the schema itself.
    const mapped = new Set(Object.keys(voucherFormInput(form())));
    const shape = (voucherFormSchema as unknown as { in: { shape: Record<string, unknown> } })
      .in.shape;
    const missing = Object.keys(shape).filter((key) => !mapped.has(key));
    expect(missing).toEqual([]);
  });
});

describe("every field the schema produces reaches the RPC", () => {
  it("leaves nothing behind", () => {
    const payload = voucherRpcPayload(parsed());
    const missing = Object.keys(parsed()).filter((key) => !(key in payload));
    expect(missing).toEqual([]);
  });
});

describe("publicise, the field that shipped broken", () => {
  it("is read off the form as true when the toggle is on", () => {
    expect(voucherFormInput(form({ publicise: "true" })).publicise).toBe(true);
  });

  it("is false when the toggle is off", () => {
    expect(voucherFormInput(form({ publicise: "false" })).publicise).toBe(false);
  });

  it("is false when the form does not mention it at all", () => {
    // An advert is opt in, so an older client that sends no field must not
    // start advertising a code. This is the one case the old default got
    // right, which is why it hid the bug.
    expect(voucherFormInput(form()).publicise).toBe(false);
  });

  it("survives the parse", () => {
    expect(parsed({ publicise: "true" }).publicise).toBe(true);
    expect(parsed({ publicise: "false" }).publicise).toBe(false);
  });

  it("reaches the RPC payload", () => {
    expect(voucherRpcPayload(parsed({ publicise: "true" })).publicise).toBe(true);
    expect(voucherRpcPayload(parsed({ publicise: "false" })).publicise).toBe(false);
  });
});

describe("isActive keeps working, since it is the field publicise was copied from", () => {
  it("is true when on and false when off", () => {
    expect(voucherRpcPayload(parsed({ isActive: "true" })).isActive).toBe(true);
    expect(voucherRpcPayload(parsed({ isActive: "false" })).isActive).toBe(false);
  });

  it("defaults to on when the form omits it, the opposite of publicise", () => {
    // The two defaults point in opposite directions deliberately. A voucher
    // that exists is meant to be redeemable; a voucher is not automatically
    // meant to be advertised.
    const data = form();
    data.delete("isActive");
    expect(voucherFormInput(data).isActive).toBe(false);
  });
});

describe("the numbers and the nulls still cross intact", () => {
  it("keeps a percentage promo's amount null rather than zero", () => {
    const payload = voucherRpcPayload(
      parsed({ discountKind: "percent", percentOff: "10", amountPesos: "" }),
    );
    expect(payload.amountCents).toBeNull();
    expect(payload.percentOff).toBe(10);
  });

  it("keeps an unlimited cap null rather than zero", () => {
    expect(voucherRpcPayload(parsed({ maxUses: "" })).maxUses).toBeNull();
  });

  it("turns pesos into centavos", () => {
    expect(voucherRpcPayload(parsed({ amountPesos: "50" })).amountCents).toBe(5000);
  });

  it("keeps an absent date null rather than the epoch", () => {
    const payload = voucherRpcPayload(parsed({ startsAt: "", expiresAt: "" }));
    expect(payload.startsAt).toBeNull();
    expect(payload.expiresAt).toBeNull();
  });
});

describe("the phone textarea", () => {
  it("splits on newlines, commas and semicolons", () => {
    expect(phoneLines("0917 111 1111\n0918 222 2222, 0919 333 3333")).toEqual([
      "0917 111 1111",
      "0918 222 2222",
      "0919 333 3333",
    ]);
  });

  it("drops blank lines rather than sending empty entries", () => {
    expect(phoneLines("\n\n0917 111 1111\n\n")).toEqual(["0917 111 1111"]);
  });

  it("is an empty list when nothing was typed", () => {
    expect(phoneLines(null)).toEqual([]);
    expect(phoneLines("")).toEqual([]);
  });
});
