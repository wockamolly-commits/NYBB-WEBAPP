import { describe, expect, it } from "vitest";
import { toAuthPhone } from "@/lib/auth/customer-identity";
import { storefrontIdentityLink } from "@/lib/auth/navigation";
import {
  requestedStaffNextPath,
  safeCustomerNextPath,
  safeStaffNextPath,
} from "@/lib/auth/redirect";
import { isCrossSiteRequest } from "@/lib/auth/request-origin";
import {
  customerAuthCookieName,
  STAFF_AUTH_COOKIE,
  STAFF_COOKIE_ENCODING,
} from "@/lib/supabase/constants";

describe("safeCustomerNextPath", () => {
  it("keeps a storefront destination and its query", () => {
    expect(safeCustomerNextPath("/checkout?from=login")).toBe("/checkout?from=login");
  });

  it("refuses external, protocol-relative, and staff destinations", () => {
    for (const unsafe of [
      "https://example.com",
      "//example.com",
      "/workspace",
      "/workspace/orders",
      "/workspace?filter=ready",
      "/api/orders",
      "/api?operation=orders",
      "/auth/signout",
      "/checkout\\example.com",
    ]) {
      expect(safeCustomerNextPath(unsafe)).toBe("/account");
    }
  });

  it("uses the caller's fallback for a missing destination", () => {
    expect(safeCustomerNextPath(null, "/menu")).toBe("/menu");
  });
});

describe("safeStaffNextPath", () => {
  it("keeps workspace destinations only", () => {
    expect(safeStaffNextPath("/workspace/orders?filter=ready")).toBe(
      "/workspace/orders?filter=ready",
    );
    expect(safeStaffNextPath("/account")).toBe("/workspace");
    expect(safeStaffNextPath("https://example.com/workspace")).toBe("/workspace");
    expect(safeStaffNextPath("/workspace/login")).toBe("/workspace");
    expect(safeStaffNextPath("/workspace/login?next=/workspace/orders")).toBe(
      "/workspace",
    );
  });

  it("distinguishes a real workspace request from public or login paths", () => {
    expect(requestedStaffNextPath("/workspace/orders?filter=ready")).toBe(
      "/workspace/orders?filter=ready",
    );
    expect(requestedStaffNextPath("/account")).toBeNull();
    expect(requestedStaffNextPath("/workspace/login")).toBeNull();
  });
});

describe("toAuthPhone", () => {
  it("normalizes local and international Philippine mobile numbers", () => {
    expect(toAuthPhone("0918 605 6360")).toBe("639186056360");
    expect(toAuthPhone("+63 (918) 605-6360")).toBe("639186056360");
    expect(toAuthPhone("639186056360")).toBe("639186056360");
  });

  it("rejects non-mobile and malformed numbers", () => {
    expect(toAuthPhone("032 318 2405")).toBeNull();
    expect(toAuthPhone("0918 605")).toBeNull();
    expect(toAuthPhone("")).toBeNull();
  });
});

describe("isCrossSiteRequest", () => {
  const request = (values: Record<string, string>) => ({
    headers: new Headers(values),
    origin: "https://order.example.com",
  });

  it("rejects cross-site browser metadata and a foreign Origin", () => {
    expect(isCrossSiteRequest(request({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteRequest(request({ origin: "https://attacker.example" }))).toBe(true);
  });

  it("allows same-origin and origin-less navigation", () => {
    expect(
      isCrossSiteRequest(
        request({
          "sec-fetch-site": "same-origin",
          origin: "https://order.example.com",
        }),
      ),
    ).toBe(false);
    expect(isCrossSiteRequest(request({}))).toBe(false);
  });
});

describe("session cookie isolation", () => {
  it("keeps customer and Workspace sessions in different cookie families", () => {
    const previous = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co";
    try {
      expect(customerAuthCookieName()).toBe("sb-project-ref-auth-token");
      expect(customerAuthCookieName()).not.toBe(STAFF_AUTH_COOKIE);
      expect(STAFF_AUTH_COOKIE).toBe("nybb-staff-auth");
      expect(STAFF_COOKIE_ENCODING).toBe("tokens-only");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = previous;
    }
  });
});

describe("Storefront identity navigation", () => {
  it("sends staff and admins back to the Workspace", () => {
    expect(
      storefrontIdentityLink({ signedIn: true, hasWorkspaceAccess: true }),
    ).toEqual({
      href: "/workspace",
      label: "Workspace",
      accessibleLabel: "Open Workspace",
    });
  });

  it("keeps regular customers on their account page", () => {
    expect(
      storefrontIdentityLink({ signedIn: true, hasWorkspaceAccess: false }),
    ).toMatchObject({ href: "/account", label: "Account" });
  });

  it("keeps guests on the sign-in path", () => {
    expect(
      storefrontIdentityLink({ signedIn: false, hasWorkspaceAccess: false }),
    ).toMatchObject({ href: "/login", label: "Sign in" });
  });
});
