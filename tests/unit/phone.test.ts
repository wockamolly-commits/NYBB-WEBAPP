import { describe, expect, it } from "vitest";
import { normalizeCustomerPhone } from "@/lib/phone";
import { checkoutFailure } from "@/lib/checkout/messages";

/**
 * The checkout's half of migration 0090. A Philippine mobile is stored in one
 * form however it was typed, so the voucher engine sees one customer.
 */
describe("normalizeCustomerPhone", () => {
  it("gives every written form of a mobile the same value", () => {
    for (const typed of [
      "0917 123 4567",
      "+63 917 123 4567",
      "+639171234567",
      "917-123-4567",
      "0063 917 123 4567",
      "(0917) 123-4567",
    ]) {
      expect(normalizeCustomerPhone(typed)).toBe("+639171234567");
    }
  });

  it("keeps a landline with its area code as typed", () => {
    expect(normalizeCustomerPhone("(032) 318-2405")).toBe("(032) 318-2405");
  });

  it("accepts a foreign number written with its country code", () => {
    expect(normalizeCustomerPhone("+1 415 555 0100")).toBe("+14155550100");
  });

  it("refuses what nobody could call", () => {
    for (const typed of ["abc", "1234", "0917 123 456", "0917 123 45678", "+63 917 12", "4155550100"]) {
      expect(normalizeCustomerPhone(typed)).toBeNull();
    }
  });
});

describe("the UNPAID_ORDERS_OPEN refusal", () => {
  it("points at the phone field", () => {
    expect(checkoutFailure("UNPAID_ORDERS_OPEN").field).toBe("phone");
  });
});
