import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/content-security-policy";

function directive(csp: string, name: string): string {
  const found = csp
    .split("; ")
    .find((part) => part === name || part.startsWith(`${name} `));
  if (!found) throw new Error(`missing directive: ${name}`);
  return found;
}

const PROD = { isDevelopment: false } as const;

describe("contentSecurityPolicy", () => {
  it("carries the nonce and strict-dynamic on script-src", () => {
    const csp = contentSecurityPolicy("abc123", PROD);
    expect(directive(csp, "script-src")).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'"
    );
  });

  it("never allows unsafe-eval in production", () => {
    expect(contentSecurityPolicy("n", PROD)).not.toContain("'unsafe-eval'");
  });

  it("allows unsafe-eval in development only, for React refresh", () => {
    const csp = contentSecurityPolicy("n", { isDevelopment: true });
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
  });

  it("allows the Supabase origin over both https and wss when configured", () => {
    const csp = contentSecurityPolicy("n", {
      ...PROD,
      supabaseUrl: "https://abc.supabase.co",
    });
    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' https://abc.supabase.co wss://abc.supabase.co"
    );
  });

  it("omits Supabase entirely when the URL is unset", () => {
    const csp = contentSecurityPolicy("n", { ...PROD, supabaseUrl: undefined });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("ignores a non-https Supabase URL rather than allowing it", () => {
    // A plaintext origin in connect-src would be silently downgraded by
    // upgrade-insecure-requests anyway, and allowing it invites a
    // misconfigured deploy to look like it works.
    const csp = contentSecurityPolicy("n", {
      ...PROD,
      supabaseUrl: "http://localhost:54321",
    });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("ignores a malformed Supabase URL rather than throwing", () => {
    const csp = contentSecurityPolicy("n", { ...PROD, supabaseUrl: "not a url" });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("keeps PayMongo out of the policy until payments are enabled", () => {
    const csp = contentSecurityPolicy("n", PROD);
    expect(csp).not.toContain("paymongo");
  });

  it("admits PayMongo to connect-src and frame-src once enabled", () => {
    const csp = contentSecurityPolicy("n", { ...PROD, paymentsEnabled: true });
    expect(directive(csp, "connect-src")).toContain("https://api.paymongo.com");
    expect(directive(csp, "frame-src")).toContain("https://*.paymongo.com");
  });

  it("never admits Google Maps: this is a pickup-only platform", () => {
    const csp = contentSecurityPolicy("n", {
      ...PROD,
      paymentsEnabled: true,
      supabaseUrl: "https://abc.supabase.co",
    });
    expect(csp).not.toContain("googleapis.com/maps");
    expect(csp).not.toContain("maps.gstatic.com");
  });

  it("locks down the framing and injection primitives", () => {
    const csp = contentSecurityPolicy("n", PROD);
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });
});
