/**
 * The one string a tapped notification carries, and how to read it.
 *
 * WHY THIS IS NOT IN `register.ts`.
 * ================================================================
 * `register.ts` imports `expo-device` and `expo-notifications`, which are
 * native modules and cannot be loaded by the repository's test runner. This
 * file imports nothing, so `tests/unit/order-deep-link.test.ts` can hold it to
 * the shape `customerPayload()` in `lib/push/payload.ts` actually writes. The
 * navigation that follows a parse is in `App.tsx` and is still only verified on
 * a real phone, per `docs/push-device-test-checklist.md`.
 */

/**
 * The order a tapped notification's `data.url` points to, or null when the
 * string is not one `customerPayload()` in `lib/push/payload.ts` wrote.
 *
 * That function is the only place this shape gets produced:
 * `/order/<shortCode>?t=<trackingToken>`. A stray or malformed value should be
 * ignored rather than crash the app that just came to the foreground, which is
 * why a percent sequence `decodeURIComponent` refuses returns null here instead
 * of throwing into a notification listener.
 */
export function parseOrderDeepLink(url: string): { shortCode: string; trackingToken: string } | null {
  const match = /^\/order\/([^/?]+)\?t=(.+)$/.exec(url);
  if (!match) return null;

  let shortCode: string;
  let trackingToken: string;
  try {
    shortCode = decodeURIComponent(match[1]);
    trackingToken = decodeURIComponent(match[2]);
  } catch {
    return null;
  }

  if (!shortCode || !trackingToken) return null;

  return { shortCode, trackingToken };
}
