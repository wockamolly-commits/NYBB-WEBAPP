import * as SecureStore from "expo-secure-store";
import type { MobileSession } from "../api/contract";

/**
 * The only module that writes a credential to this device.
 *
 * WHY SECURE STORE AND NOT ASYNC STORAGE.
 * ================================================================
 * Three of the four things kept here are bearer credentials: the access token,
 * the refresh token, and the guest order's tracking token. Whoever holds the
 * refresh token can mint access tokens until it is rotated; whoever holds a
 * tracking token can read a stranger's name, phone number and pickup code.
 * AsyncStorage is an unencrypted file in the app's sandbox, readable from a
 * filesystem backup and from a rooted or jailbroken device. SecureStore is the
 * Keychain on iOS and Keystore-backed encrypted preferences on Android, which is
 * where these belong and is the whole reason this slice waited for a dependency
 * rather than shipping with `useState`.
 *
 * WHY FOUR KEYS AND NOT ONE JSON BLOB.
 * ================================================================
 * SecureStore warns above 2048 bytes per value and iOS is where that bites. A
 * Supabase access token with a fat payload is most of that budget on its own, so
 * one blob holding two tokens is a write that starts failing on the accounts
 * with the most claims, which is the worst possible population to break for.
 * Split, no single value is close to the limit.
 *
 * EVERY READ AND WRITE IS BEST EFFORT, AND THAT IS DELIBERATE.
 * ================================================================
 * A SecureStore call can fail: a device with no passcode, a keychain locked
 * during a background wake, a user who restored a backup onto new hardware.
 * Throwing here would crash the app on launch over a stored token, which is a
 * worse outcome than being signed out. So a failed read is "nothing stored" and
 * a failed write is logged and swallowed. The consequence is honest: a customer
 * on a device where this does not work signs in again each launch and can still
 * order.
 */

const ACCESS_KEY = "nybb.session.access";
const REFRESH_KEY = "nybb.session.refresh";
const META_KEY = "nybb.session.meta";
const ORDER_KEY = "nybb.order";

/**
 * The order this app is currently tracking, kept across a termination.
 *
 * This is what the App.tsx header used to be honest about not having. Without
 * it, an operating system that reclaims the app between placing an order and
 * paying for it leaves the customer with no way back to an unpaid order except
 * the branch's phone. The tracking token is the credential that reads it, which
 * is why it is in here and not in ordinary storage.
 */
export type StoredOrder = {
  shortCode: string;
  trackingToken: string | null;
};

async function readKey(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    // Not logged with the key's value, obviously, and not logged at all: a
    // locked keychain is an expected state, not a fault worth a line per launch.
    return null;
  }
}

async function writeKey(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.warn(`[session] could not write ${key}`, error instanceof Error ? error.message : "");
  }
}

/** The stored session, or null when there is nothing usable to restore. */
export async function loadSession(): Promise<MobileSession | null> {
  const [accessToken, refreshToken, rawMeta] = await Promise.all([
    readKey(ACCESS_KEY),
    readKey(REFRESH_KEY),
    readKey(META_KEY),
  ]);

  // The refresh token is the one that makes a session restorable. An access
  // token without it is a credential with an hour to live and no way to renew,
  // so treating that as signed in only delays the sign-in screen.
  if (!refreshToken) return null;

  let expiresAt = 0;
  let email: string | null = null;
  if (rawMeta) {
    try {
      const meta = JSON.parse(rawMeta) as { expiresAt?: unknown; email?: unknown };
      if (typeof meta.expiresAt === "number") expiresAt = meta.expiresAt;
      if (typeof meta.email === "string") email = meta.email;
    } catch {
      // Corrupt metadata costs the expiry hint, not the session. An expiry of
      // zero reads as already expired, so the caller refreshes, which is exactly
      // what it should do when it cannot tell.
    }
  }

  return { accessToken: accessToken ?? "", refreshToken, expiresAt, email };
}

export async function saveSession(session: MobileSession): Promise<void> {
  await Promise.all([
    writeKey(ACCESS_KEY, session.accessToken),
    writeKey(REFRESH_KEY, session.refreshToken),
    writeKey(META_KEY, JSON.stringify({ expiresAt: session.expiresAt, email: session.email })),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    writeKey(ACCESS_KEY, null),
    writeKey(REFRESH_KEY, null),
    writeKey(META_KEY, null),
  ]);
}

export async function loadOrder(): Promise<StoredOrder | null> {
  const raw = await readKey(ORDER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { shortCode?: unknown; trackingToken?: unknown };
    if (typeof parsed.shortCode !== "string" || parsed.shortCode.length === 0) return null;
    return {
      shortCode: parsed.shortCode,
      trackingToken: typeof parsed.trackingToken === "string" ? parsed.trackingToken : null,
    };
  } catch {
    return null;
  }
}

export async function saveOrder(order: StoredOrder): Promise<void> {
  await writeKey(ORDER_KEY, JSON.stringify(order));
}

export async function clearOrder(): Promise<void> {
  await writeKey(ORDER_KEY, null);
}

/**
 * How long before expiry a token is treated as already stale.
 *
 * A token that expires during the request it was attached to fails at the
 * server, which is a refusal the customer sees. Sixty seconds is enough to cover
 * a slow round trip on mobile data and a phone clock that is a little ahead.
 */
export const REFRESH_MARGIN_MS = 60 * 1000;

export function sessionNeedsRefresh(session: MobileSession, now = Date.now()): boolean {
  if (!session.accessToken) return true;
  return session.expiresAt - REFRESH_MARGIN_MS <= now;
}
