import { describe, expect, it } from "vitest";
import { hasCronAuthorization } from "@/lib/cron/authorization";

describe("cron authorization", () => {
  it("accepts only the configured bearer token", () => {
    expect(hasCronAuthorization("Bearer a-long-secret", "a-long-secret")).toBe(true);
    expect(hasCronAuthorization("Bearer a-long-secrex", "a-long-secret")).toBe(false);
    expect(hasCronAuthorization("Basic a-long-secret", "a-long-secret")).toBe(false);
    expect(hasCronAuthorization(null, "a-long-secret")).toBe(false);
  });
});
