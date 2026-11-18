import { describe, expect, it } from "vitest";
import { franchiseAlertMessage, telHref } from "@/lib/email/franchise-alert-message";
import type { FranchiseInquiry } from "@/lib/franchise/inquiry";

/**
 * The alert's layout. `tests/unit/franchise-alert.test.ts` covers whether and
 * where it is sent; this covers what the owner sees when it arrives.
 */

const inquiry: FranchiseInquiry = {
  name: "Maria Santos",
  email: "maria@example.com",
  phone: "+63 918 605 6360",
  city: "Cebu City",
  message: "Interested in a branch near IT Park.\nWe have a 40 sqm space.",
};

// 2026-11-18 02:28 UTC is 10:28 in the morning in Manila.
const at = new Date("2026-11-18T02:28:00Z");

describe("franchiseAlertMessage", () => {
  it("shows the arrival time in Manila, not UTC", () => {
    const { html, text } = franchiseAlertMessage(inquiry, at);
    expect(text).toContain("10:28");
    expect(html).toContain("10:28");
  });

  it("offers reply and call buttons that go to the lead", () => {
    const { html } = franchiseAlertMessage(inquiry, at);
    expect(html).toContain('href="mailto:maria@example.com?subject=');
    expect(html).toContain('href="tel:+639186056360"');
    expect(html).toContain("Reply to Maria");
  });

  it("drops the call button when the phone field holds nothing dialable", () => {
    const { html } = franchiseAlertMessage({ ...inquiry, phone: "call me" }, at);
    expect(html).not.toContain("tel:");
    expect(html).toContain("call me");
  });

  it("keeps the line breaks the lead typed", () => {
    const { html } = franchiseAlertMessage(inquiry, at);
    expect(html).toContain("IT Park.<br>We have");
  });

  it("escapes anything a lead types that looks like markup", () => {
    const { html } = franchiseAlertMessage(
      {
        ...inquiry,
        name: `<script>alert("x")</script>`,
        city: `O'Brien & <b>Co</b>`,
        message: `<img src=x onerror=alert(1)>`,
      },
      at,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>Co</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("O&#39;Brien &amp; &lt;b&gt;Co&lt;/b&gt;");
  });

  it("says so plainly when the optional fields were left empty", () => {
    const { html, text } = franchiseAlertMessage(
      { ...inquiry, city: undefined, message: undefined },
      at,
    );
    expect(text).toMatch(/City:\s+Not given/);
    expect(html).toContain("No location given");
    expect(html).toContain("They did not leave a message.");
  });

  it("links to the leads screen", () => {
    const { html, text } = franchiseAlertMessage(inquiry, at);
    expect(html).toContain("/workspace/franchise");
    expect(text).toContain("/workspace/franchise");
  });

  it("keeps the subject the lock screen reads", () => {
    expect(franchiseAlertMessage(inquiry, at).subject).toBe(
      "Franchise inquiry: Maria Santos (Cebu City)",
    );
  });
});

describe("telHref", () => {
  it("keeps the digits and a leading plus", () => {
    expect(telHref("+63 (918) 605-6360")).toBe("tel:+639186056360");
    expect(telHref("0918 605 6360")).toBe("tel:09186056360");
  });

  it("refuses something too short to dial", () => {
    expect(telHref("123")).toBeNull();
    expect(telHref("n/a")).toBeNull();
  });
});
