import { describe, expect, it } from "vitest";
import {
  franchiseInquirySchema,
  firstIssue,
  looksAutomated,
  HONEYPOT_FIELD,
} from "@/lib/franchise/inquiry";

const valid = {
  name: "Maria Santos",
  email: "maria@example.com",
  phone: "0917 000 0000",
};

describe("franchiseInquirySchema", () => {
  it("accepts the three fields somebody needs to call you back", () => {
    const parsed = franchiseInquirySchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("folds and trims the email, so one person is one lead", () => {
    const parsed = franchiseInquirySchema.parse({ ...valid, email: "  Maria@Example.COM " });
    expect(parsed.email).toBe("maria@example.com");
  });

  it("trims the name rather than refusing padded input", () => {
    const parsed = franchiseInquirySchema.parse({ ...valid, name: "  Maria Santos  " });
    expect(parsed.name).toBe("Maria Santos");
  });

  it("treats whitespace-only optional fields as absent", () => {
    const parsed = franchiseInquirySchema.parse({ ...valid, city: "   ", message: "  " });
    expect(parsed.city).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it.each([
    ["name", { ...valid, name: "   " }],
    ["email", { ...valid, email: "not-an-email" }],
    ["phone", { ...valid, phone: "" }],
  ])("refuses a lead missing a usable %s", (_field, input) => {
    expect(franchiseInquirySchema.safeParse(input).success).toBe(false);
  });

  it.each([
    ["name", { ...valid, name: "a".repeat(121) }],
    ["city", { ...valid, city: "a".repeat(161) }],
    ["message", { ...valid, message: "a".repeat(4001) }],
  ])("refuses an over-long %s, matching the database guard", (_field, input) => {
    expect(franchiseInquirySchema.safeParse(input).success).toBe(false);
  });

  it("accepts a foreign phone number, because franchisees are not all local", () => {
    // Deliberate: any Philippine-shaped pattern would reject real buyers, and a
    // rejected franchise inquiry is a lost lead rather than a retried order.
    for (const phone of ["+65 8123 4567", "(032) 520-4930", "09170000000"]) {
      expect(franchiseInquirySchema.safeParse({ ...valid, phone }).success).toBe(true);
    }
  });

  it("gives a message a person can act on, not a schema path", () => {
    const parsed = franchiseInquirySchema.safeParse({ ...valid, email: "nope" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(firstIssue(parsed.error)).toBe("Enter an email address we can reply to.");
    }
  });
});

describe("looksAutomated", () => {
  it("is quiet for the empty honeypot a person leaves behind", () => {
    expect(looksAutomated("")).toBe(false);
    expect(looksAutomated("   ")).toBe(false);
    expect(looksAutomated(null)).toBe(false);
    expect(looksAutomated(undefined)).toBe(false);
  });

  it("catches the bot that filled it in", () => {
    expect(looksAutomated("https://spam.example")).toBe(true);
  });

  it("names a field a form filler would plausibly want", () => {
    // If the name looked like a trap, the bots worth catching would skip it.
    expect(HONEYPOT_FIELD).toBe("company_website");
  });
});
