import { describe, expect, it } from "vitest";
import { addressBucket, addressRateKey, clientAddress } from "@/lib/rate-limit/address";

/**
 * The address dimension of rate limiting, on the TypeScript side.
 *
 * Three claims carry this feature and they are what is tested here. An address
 * that cannot be parsed must not become a bucket, because `rate_limits` is
 * keyed on a primary key that nothing prunes and an attacker who can invent
 * keys can grow that table forever. An IPv6 customer must be counted by their
 * /64, because they are routinely handed one and counting /128s would make the
 * limit decorative. And no bucket may collapse unrelated visitors together,
 * because a shared bucket that fills refuses orders for people who never sent
 * a request.
 *
 * What is deliberately not tested here is the limiter itself. It is four lines
 * of fail-open around one RPC, and the thing worth proving about it needs a
 * real PostgREST to prove: that `service_role` may call `rate_limit_hit` and
 * `anon` may not. `tests/sql/place-order.test.ts` already asserts the grant
 * shape, and the round trip is on the list for the day the project exists.
 */

function headersWith(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("reading the client address off a request", () => {
  it("prefers the platform header, which arrives as one address", () => {
    const headers = headersWith({
      "x-vercel-forwarded-for": "203.0.113.5",
      "x-forwarded-for": "198.51.100.9",
    });
    expect(clientAddress(headers)).toBe("203.0.113.5");
  });

  it("takes the leftmost entry of a forwarding chain", () => {
    // "client, proxy1, proxy2". Taking a later entry would bucket every
    // customer behind one proxy together.
    const headers = headersWith({ "x-forwarded-for": "203.0.113.5, 198.51.100.9, 192.0.2.1" });
    expect(clientAddress(headers)).toBe("203.0.113.5");
  });

  it("strips a port from either address family", () => {
    expect(clientAddress(headersWith({ "x-real-ip": "203.0.113.5:56789" }))).toBe("203.0.113.5");
    expect(clientAddress(headersWith({ "x-real-ip": "[2001:db8::1]:56789" }))).toBe("2001:db8::1");
  });

  it("does not mistake a bare IPv6 address for a host and port", () => {
    // The naive "split on the last colon" would return 2001:db8: here, which
    // is a different address and, worse, a plausible looking one.
    expect(clientAddress(headersWith({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("returns null rather than a bucket for anything that is not an address", () => {
    // This is the table-flooding guard. Every one of these would otherwise
    // become a permanent row in rate_limits, one per distinct value sent.
    for (const bad of [
      "not-an-address",
      "999.999.999.999",
      "'; drop table rate_limits; --",
      "",
      " ",
      "0x7f000001",
    ]) {
      expect(clientAddress(headersWith({ "x-forwarded-for": bad })), bad).toBeNull();
    }
  });

  it("returns null when the request carries no address header at all", () => {
    expect(clientAddress(headersWith({ "user-agent": "whatever" }))).toBeNull();
  });

  it("falls through a junk platform header to a usable one", () => {
    // A present but unparseable header must not shadow a good one, or a single
    // malformed value would switch the limit off for that request.
    const headers = headersWith({
      "x-vercel-forwarded-for": "garbage",
      "x-forwarded-for": "203.0.113.5",
    });
    expect(clientAddress(headers)).toBe("203.0.113.5");
  });
});

describe("what actually gets counted", () => {
  it("counts an IPv4 address as itself", () => {
    expect(addressBucket("203.0.113.5")).toBe("203.0.113.5");
  });

  it("counts IPv6 by the /64 the customer was handed", () => {
    // One subscriber, one /64, billions of addresses inside it. Counting the
    // full address would let a single connection present a fresh identity per
    // request and never reach the limit.
    const one = addressBucket("2001:db8:1234:5678:0000:0000:0000:0001");
    const another = addressBucket("2001:db8:1234:5678:ffff:ffff:ffff:ffff");
    expect(one).toBe(another);
    expect(one).toBe("2001:db8:1234:5678::/64");
  });

  it("separates two different /64s", () => {
    expect(addressBucket("2001:db8:1234:5678::1")).not.toBe(addressBucket("2001:db8:1234:9999::1"));
  });

  it("expands the compressed form to the same bucket as the long one", () => {
    expect(addressBucket("2001:db8::1")).toBe(addressBucket("2001:0db8:0000:0000:0000:0000:0000:0001"));
  });

  it("gives an IPv4-mapped address its IPv4 bucket, not an all-zero prefix", () => {
    // The /64 of ::ffff:a.b.c.d is all zeros, so bucketing on the prefix would
    // file every IPv4-mapped visitor on earth into one key. That key fills, and
    // then the site refuses orders from people who have not ordered.
    expect(addressBucket("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(addressBucket("::ffff:198.51.100.9")).toBe("198.51.100.9");
    expect(addressBucket("::ffff:203.0.113.5")).not.toBe(addressBucket("::ffff:198.51.100.9"));
  });
});

describe("the rate limit key", () => {
  it("does not contain the address", () => {
    // rate_limits rows outlive their window, so a raw address would make that
    // table a permanent record of where customers ordered from.
    const key = addressRateKey("place_order", "203.0.113.5");
    expect(key).not.toContain("203.0.113.5");
    expect(key).toMatch(/^place_order:ip:[0-9a-f]{32}$/);
  });

  it("is stable for one address and different for another", () => {
    expect(addressRateKey("place_order", "203.0.113.5")).toBe(
      addressRateKey("place_order", "203.0.113.5"),
    );
    expect(addressRateKey("place_order", "203.0.113.5")).not.toBe(
      addressRateKey("place_order", "198.51.100.9"),
    );
  });

  it("namespaces by action, so one limit cannot refuse another", () => {
    // Ordering too fast must not also block asking for a sign-in code, which
    // is the next thing this limiter is asked to guard.
    expect(addressRateKey("place_order", "203.0.113.5")).not.toBe(
      addressRateKey("request_otp", "203.0.113.5"),
    );
  });

  it("is null for no address, so the caller skips the limit entirely", () => {
    // Null must not become a shared "unknown" bucket. That bucket would fill
    // and refuse every request whose address could not be read.
    expect(addressRateKey("place_order", null)).toBeNull();
    expect(addressRateKey("place_order", "not-an-address")).toBeNull();
  });
});
