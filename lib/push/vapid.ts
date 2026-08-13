/**
 * The 87 character assertion, which spec section 15 makes a hard rule.
 *
 * A VAPID public key that is the wrong length does not produce an error. The
 * browser's `PushManager.subscribe()` rejects, the opt-in button catches it and
 * disappears, and there is nothing in any log to say why. So this shouts at
 * startup instead, where somebody is looking.
 *
 * An absent key is not an error: it means push is not configured in this
 * environment, which is the correct state for a test run. An empty string is
 * treated the same way, because `.env.example` ships
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY=` with no value, and that is the documented
 * way to set this project up. Empty means unconfigured, not misconfigured.
 * Only a key that is present and the wrong length is worth shouting about.
 */
const VAPID_PUBLIC_KEY_LENGTH = 87;

export function assertVapidKey(key: string | undefined): void {
  if (key === undefined || key === "") return;
  if (key.length !== VAPID_PUBLIC_KEY_LENGTH) {
    throw new Error(
      `NEXT_PUBLIC_VAPID_PUBLIC_KEY must be ${VAPID_PUBLIC_KEY_LENGTH} characters, ` +
        `got ${key.length}. Staff push opt-in will fail silently until this is fixed.`,
    );
  }
}

export function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}
