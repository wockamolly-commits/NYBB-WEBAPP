import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The lead alert, with the mail provider and the database both mocked.
 *
 * Two properties matter more than the message itself, and both are about what
 * happens when this fails rather than when it works.
 *
 * A LEAD IS NEVER LOST TO A MAIL FAILURE. `storeFranchiseInquiry` has already
 * written the row by the time any of this runs, and nothing here may throw back
 * into the caller. The row is the system of record; the mail is a convenience
 * on top of it.
 *
 * A LEAD'S DETAILS NEVER REACH A LOG LINE. This is a stranger's name, email and
 * phone number. `lib/franchise/submit.ts` already refuses to log them for the
 * same reason, and an alert that failed is exactly when somebody is tempted to
 * log the payload to find out why.
 */

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  settings: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

vi.mock("@/lib/supabase/admin-client", () => ({
  adminConfigured: () => true,
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => mocks.settings() }),
      }),
    }),
  }),
}));

import { sendFranchiseAlert } from "@/lib/email/franchise-alert";
import type { FranchiseInquiry } from "@/lib/franchise/inquiry";

const inquiry: FranchiseInquiry = {
  name: "Maria Santos",
  email: "maria@example.com",
  phone: "09186056360",
  city: "Cebu City",
  message: "Interested in a branch near IT Park.",
};

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("RESEND_FROM", "NYBB Alerts <alerts@example.com>");
  vi.stubEnv("FRANCHISE_ALERT_TO", "owner@example.com");
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  mocks.settings.mockReset();
  mocks.settings.mockResolvedValue({ data: { email_enabled: true }, error: null });
});

describe("sendFranchiseAlert", () => {
  it("sends to the configured address and carries the lead", async () => {
    const result = await sendFranchiseAlert(inquiry);

    expect(result).toEqual({ ok: true });
    const sent = mocks.send.mock.calls[0]?.[0];
    expect(sent.to).toEqual(["owner@example.com"]);
    expect(sent.from).toBe("NYBB Alerts <alerts@example.com>");
    expect(sent.subject).toContain("Maria Santos");
    expect(sent.subject).toContain("Cebu City");
    expect(sent.text).toContain("maria@example.com");
    expect(sent.text).toContain("09186056360");
    expect(sent.text).toContain("Interested in a branch near IT Park.");
  });

  /**
   * The single thing that makes "reply from your inbox" real. Without it a
   * reply goes to the sending address, which nobody reads, and the owner has
   * to copy the address out of the body by hand every time.
   */
  it("sets reply-to to the inquirer, not the sender", async () => {
    await sendFranchiseAlert(inquiry);
    expect(mocks.send.mock.calls[0]?.[0].replyTo).toBe("maria@example.com");
  });

  it("links to the leads screen rather than making the owner find it", async () => {
    await sendFranchiseAlert(inquiry);
    expect(mocks.send.mock.calls[0]?.[0].text).toContain("/workspace/franchise");
  });

  it("says so plainly when a lead left the optional fields empty", async () => {
    await sendFranchiseAlert({ ...inquiry, city: undefined, message: undefined });
    const sent = mocks.send.mock.calls[0]?.[0];
    // Not an empty gap that reads as a rendering fault.
    expect(sent.text).toMatch(/not (given|said)/i);
  });

  describe("the two off switches", () => {
    it("sends nothing when no API key is configured", async () => {
      vi.stubEnv("RESEND_API_KEY", "");
      const result = await sendFranchiseAlert(inquiry);
      expect(result).toEqual({ ok: false, reason: "unconfigured" });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("sends nothing when no from address is configured", async () => {
      vi.stubEnv("RESEND_FROM", "");
      const result = await sendFranchiseAlert(inquiry);
      expect(result).toEqual({ ok: false, reason: "unconfigured" });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("sends nothing when the owner has turned email off in app_settings", async () => {
      mocks.settings.mockResolvedValue({ data: { email_enabled: false }, error: null });
      const result = await sendFranchiseAlert(inquiry);
      expect(result).toEqual({ ok: false, reason: "disabled" });
      expect(mocks.send).not.toHaveBeenCalled();
    });

    it("does not send when the settings read fails, rather than guessing", async () => {
      mocks.settings.mockResolvedValue({ data: null, error: { message: "boom" } });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await sendFranchiseAlert(inquiry);
      expect(result).toEqual({ ok: false, reason: "disabled" });
      expect(mocks.send).not.toHaveBeenCalled();
    });
  });

  describe("when it goes wrong", () => {
    it("resolves rather than throwing when the provider returns an error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.send.mockResolvedValue({ data: null, error: { message: "rate limited" } });

      await expect(sendFranchiseAlert(inquiry)).resolves.toEqual({
        ok: false,
        reason: "send_failed",
      });
    });

    it("resolves rather than throwing when the provider throws outright", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.send.mockRejectedValue(new Error("socket hang up"));

      await expect(sendFranchiseAlert(inquiry)).resolves.toEqual({
        ok: false,
        reason: "send_failed",
      });
    });

    it("never logs the lead's name, email, phone or message", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.send.mockRejectedValue(new Error("socket hang up"));

      await sendFranchiseAlert(inquiry);

      const logged = spy.mock.calls.flat().map((v) => JSON.stringify(v)).join(" ");
      expect(logged).not.toContain("Maria Santos");
      expect(logged).not.toContain("maria@example.com");
      expect(logged).not.toContain("09186056360");
      expect(logged).not.toContain("Interested in a branch");
      spy.mockRestore();
    });
  });
});

/**
 * A source tripwire, not a unit test, in the same spirit as
 * tests/unit/push-triggers.test.ts.
 *
 * The invariant is an ORDERING, and an ordering cannot be asserted by mocking
 * the thing that comes second. A lead must be stored before any mail is
 * attempted, and the mail must be handed to `after()` rather than awaited. Both
 * are easy to undo by accident while tidying the action, and neither failure
 * shows up in a passing test: awaiting the send merely makes the form feel slow,
 * and moving it above the store only loses a lead on the day the mail fails.
 */
describe("the trigger point", () => {
  const source = readFileSync("app/(marketing)/franchise/actions.ts", "utf8");

  it("hands the alert to after() rather than awaiting it", () => {
    expect(source).toMatch(/import \{[^}]*after[^}]*\} from "next\/server"/);
    expect(source).toContain("after(sendFranchiseAlert(");
    expect(source).not.toContain("await sendFranchiseAlert(");
  });

  it("sends only after the lead is stored, and only when the store succeeded", () => {
    const store = source.indexOf("storeFranchiseInquiry(parsed.data");
    const guard = source.indexOf("if (!result.ok)");
    const alert = source.indexOf("after(sendFranchiseAlert(");

    expect(store).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(store);
    expect(alert).toBeGreaterThan(guard);
  });
});
