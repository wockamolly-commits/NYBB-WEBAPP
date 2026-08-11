import { timingSafeEqual } from "node:crypto";

/** Compares the cron bearer token without leaking the matching prefix. */
export function hasCronAuthorization(header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const received = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
