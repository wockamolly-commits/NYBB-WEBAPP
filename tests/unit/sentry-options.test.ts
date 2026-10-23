import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  redactText,
  redactUrl,
  scrubBreadcrumb,
  scrubEvent,
  sentryOptions,
} from "@/lib/monitoring/sentry-options";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sentryOptions", () => {
  it("is off when no DSN is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    expect(sentryOptions().enabled).toBe(false);
    expect(sentryOptions().dsn).toBeUndefined();
  });

  it("is on when a DSN is set, and never sends default PII", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/2");
    const options = sentryOptions();
    expect(options.enabled).toBe(true);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.tracesSampleRate).toBe(0);
  });
});

describe("redactText", () => {
  it.each(["09171234567", "0917 123 4567", "+63 917 123 4567", "+639171234567", "63-917-123-4567"])(
    "masks the mobile %s",
    (phone) => {
      expect(redactText(`duplicate key for ${phone} in orders`)).toBe(
        "duplicate key for [phone] in orders",
      );
    },
  );

  it("masks an email address", () => {
    expect(redactText("no staff row for juan.dela+cruz@gmail.com")).toBe(
      "no staff row for [email]",
    );
  });

  it("leaves an ordinary message alone", () => {
    expect(redactText("Cannot read properties of undefined (reading 'id')")).toBe(
      "Cannot read properties of undefined (reading 'id')",
    );
  });
});

describe("redactUrl", () => {
  it("drops the query string and fragment", () => {
    expect(redactUrl("https://x.supabase.co/rest/v1/orders?phone=eq.%2B639171234567#a")).toBe(
      "https://x.supabase.co/rest/v1/orders",
    );
  });

  it("masks the code on a receipt page", () => {
    expect(redactUrl("https://www.nybuffalobrads.com.ph/order/AB12CD")).toBe(
      "https://www.nybuffalobrads.com.ph/order/[code]",
    );
    expect(redactUrl("/order/AB12CD/")).toBe("/order/[code]/");
  });
});

describe("scrubEvent", () => {
  it("keeps only the URL and method of the request, and drops the user", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://www.nybuffalobrads.com.ph/checkout?voucher=SAVE10",
        method: "POST",
        cookies: { "sb-access-token": "secret" },
        headers: { cookie: "sb=secret", "user-agent": "x" },
        data: { phone: "09171234567" },
        query_string: "voucher=SAVE10",
      },
      user: { ip_address: "1.2.3.4", email: "a@b.co" },
    } as ErrorEvent);

    expect(event.request).toEqual({
      url: "https://www.nybuffalobrads.com.ph/checkout",
      method: "POST",
    });
    expect(event.user).toBeUndefined();
  });

  it("redacts exception values, the message, and breadcrumbs", () => {
    const event = scrubEvent({
      type: undefined,
      message: "failed for 09171234567",
      exception: { values: [{ type: "Error", value: "row (juan@x.com, 09171234567)" }] },
      breadcrumbs: [
        { category: "console", message: "logged a row" },
        { category: "fetch", data: { url: "https://x.supabase.co/rest/v1/o?id=eq.1" } },
      ],
    } as ErrorEvent);

    expect(event.message).toBe("failed for [phone]");
    expect(event.exception?.values?.[0].value).toBe("row ([email], [phone])");
    expect(event.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "https://x.supabase.co/rest/v1/o" } },
    ]);
  });
});

describe("scrubBreadcrumb", () => {
  it("cuts navigation URLs down", () => {
    expect(
      scrubBreadcrumb({ category: "navigation", data: { from: "/order/XYZ", to: "/menu?q=wings" } }),
    ).toEqual({ category: "navigation", data: { from: "/order/[code]", to: "/menu" } });
  });
});
