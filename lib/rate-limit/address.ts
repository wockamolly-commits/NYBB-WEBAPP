import { createHash } from "node:crypto";
import { isIP } from "node:net";

/**
 * Turning a request into a rate limiting bucket for the address it came from.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT.
 * ================================================================
 * `place_order` already rate limits on an identity Postgres can verify for
 * itself: `auth.uid()`, or failing that the phone number the order will be
 * collected against. That is the real control and it stays the real control.
 * What it cannot see is the client address, because Postgres is talking to
 * PostgREST rather than to the customer, so the one dimension spec section 22
 * item 6 asks for that the database cannot supply has to be added here.
 *
 * **This is defence in depth and not a security boundary, and the difference
 * matters.** Every header below is supplied by whatever spoke to the server
 * last. On a platform that overwrites them (Vercel does, which is the
 * deployment target) they are the platform's word and are worth something. If
 * this app is ever served without such a proxy in front of it, the value
 * becomes caller-controlled, and an attacker who can set `x-forwarded-for` can
 * evade this limit completely by rotating it. Nothing here should ever be the
 * only thing standing between a caller and an expensive operation.
 *
 * TWO REASONS THIS VALIDATES BEFORE IT COUNTS.
 * ================================================================
 * `rate_limits` is keyed on `key text primary key` and nothing prunes it, so a
 * caller who can invent distinct keys can add a permanent row per request. An
 * unvalidated header is exactly that: send a random string each time and the
 * table grows without bound. So a candidate has to parse as a real address
 * (`node:net`'s own `isIP`, rather than a regex written here) or it is treated
 * as no address at all.
 *
 * And IPv6 is bucketed by its /64 prefix rather than by the full address. A
 * single residential customer is routinely handed a /64, so counting /128s
 * would let one connection present billions of distinct addresses and make the
 * limit decorative.
 *
 * THE ADDRESS IS NOT STORED.
 * ================================================================
 * The key is a hash, because `rate_limits` rows outlive the window they were
 * counting: the window rolls but the row stays, so raw addresses would turn
 * that table into a permanent log of where customers ordered from, which is
 * not something this product needs to keep in order to count to twenty.
 *
 * Be honest about the strength of that: IPv4 is only four billion values, so a
 * plain digest is reversible by anybody willing to enumerate it. The hash
 * removes the casual read, not a determined one. What actually protects the
 * table is that 0009 gives it no policy at all and 0010 grants
 * `rate_limit_hit` to `service_role` alone. If this ever needs to be genuinely
 * unrecoverable, the change is an HMAC under a dedicated secret, not a
 * different digest.
 */

/**
 * In order of how much the value is worth.
 *
 * `x-vercel-forwarded-for` is set by the platform and arrives as a single
 * address, so it needs no reasoning about which entry is the client.
 * `x-forwarded-for` is the general form, `client, proxy1, proxy2`, where the
 * leftmost entry is the original client and everything after it is the chain.
 * The leftmost is the one to take, and it is also the one an upstream that
 * does not sanitize would let a caller choose, which is the trust assumption
 * the header comment above spells out.
 */
const CANDIDATE_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

/** `1.2.3.4:56789` and `[2001:db8::1]:56789` both appear in the wild. */
function stripPort(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    const close = trimmed.indexOf("]");
    return close === -1 ? trimmed : trimmed.slice(1, close);
  }

  // Only strip a port from IPv4. A bare IPv6 address is full of colons, and
  // cutting at the last one would quietly truncate it into a different address.
  const parts = trimmed.split(":");
  if (parts.length === 2) return parts[0];

  return trimmed;
}

/**
 * The client address, or null when there is nothing trustworthy to read.
 *
 * Null is the honest answer and callers must treat it as "do not limit" rather
 * than bucketing every unknown request into one shared key. That shared key
 * would fill, and then a single limiter bucket would be refusing orders for
 * every customer whose address could not be read, which is a denial of service
 * this code would have inflicted on itself.
 */
export function clientAddress(headers: Headers): string | null {
  for (const name of CANDIDATE_HEADERS) {
    const raw = headers.get(name);
    if (!raw) continue;

    const candidate = stripPort(raw.split(",")[0] ?? "");
    if (isIP(candidate)) return candidate;
  }

  return null;
}

/** `::ffff:203.0.113.5` and `::203.0.113.5` carry a real IPv4 inside them. */
function ipv4Inside(address: string): string | null {
  if (!address.includes(".")) return null;
  const tail = address.slice(address.lastIndexOf(":") + 1);
  return isIP(tail) === 4 ? tail : null;
}

/** The eight groups of an IPv6 address, with `::` expanded and zeros trimmed. */
function expandIPv6(address: string): string[] | null {
  const halves = address.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  const groups =
    halves.length === 1 ? head : [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail];

  if (groups.length !== 8) return null;

  return groups.map((group) => (Number.parseInt(group || "0", 16) || 0).toString(16));
}

/**
 * The thing actually counted: one address for IPv4, one /64 for IPv6.
 *
 * An IPv4-mapped IPv6 address returns its IPv4 form rather than its prefix. Its
 * real /64 is all zeros, so bucketing on that would file every IPv4-mapped
 * visitor into a single shared key, which is the self-inflicted outage
 * described above arriving by a different route.
 */
export function addressBucket(address: string): string | null {
  const kind = isIP(address);
  if (kind === 4) return address;
  if (kind !== 6) return null;

  const mapped = ipv4Inside(address);
  if (mapped) return mapped;

  const groups = expandIPv6(address);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : null;
}

/**
 * The `rate_limits.key` for an address, namespaced by the action it guards.
 *
 * Namespaced because the OTP request and the franchise form are limited too
 * (spec section 22 item 6), and a shared key would mean somebody who looked at
 * the menu too fast could not then ask for a sign-in code.
 */
export function addressRateKey(action: string, address: string | null): string | null {
  if (!address) return null;

  const bucket = addressBucket(address);
  if (!bucket) return null;

  const digest = createHash("sha256").update(bucket).digest("hex").slice(0, 32);
  return `${action}:ip:${digest}`;
}
