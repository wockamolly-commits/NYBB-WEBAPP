import { describe, expect, it } from "vitest";
import { isSealCurrent, legalDetails, npcSeal, pendingDetails, type LegalDetails } from "@/lib/legal/details";

describe("isSealCurrent", () => {
  it("shows the seal through the last day printed on it, in Manila", () => {
    // 23:59 on 28 October in Manila is 15:59 UTC the same day.
    expect(isSealCurrent("2026-10-28", new Date("2026-10-28T15:59:00Z"))).toBe(true);
  });

  it("hides it from midnight Manila time the next day", () => {
    // 00:00 on 29 October in Manila is still 28 October in UTC.
    expect(isSealCurrent("2026-10-28", new Date("2026-10-28T16:00:00Z"))).toBe(false);
  });

  it("refuses a date it cannot read rather than showing the seal forever", () => {
    expect(isSealCurrent("", new Date("2026-01-01T00:00:00Z"))).toBe(false);
    expect(isSealCurrent("28 October 2026", new Date("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("is configured with a real date", () => {
    expect(npcSeal.validThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("pendingDetails", () => {
  const filled: LegalDetails = {
    businessName: "A",
    businessAddress: "B",
    dpoName: "C",
    dpoEmail: "d@example.com",
    dpoPhone: "E",
    retentionPolicy: "F",
    refundPolicy: "G",
    noShowPolicy: "H",
    cancellationPolicy: "I",
    effectiveDate: "2026-11-01",
  };

  it("is empty once every detail is supplied", () => {
    expect(pendingDetails(filled)).toEqual([]);
  });

  it("treats null and a blank string alike as not supplied", () => {
    expect(pendingDetails({ ...filled, dpoName: null, refundPolicy: "  " })).toEqual([
      "dpoName",
      "refundPolicy",
    ]);
  });

  it("reports what the live pages are still waiting on", () => {
    // Not a fixed list: it shrinks as the owner supplies details. It only
    // checks that the draft notice and the placeholders agree with the data.
    const pending = pendingDetails(legalDetails);
    for (const key of pending) expect(legalDetails[key]?.trim() || null).toBeNull();
  });
});
