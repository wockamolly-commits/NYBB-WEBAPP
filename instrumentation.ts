import { assertVapidKey } from "@/lib/push/vapid";

/**
 * Runs once per server start. The VAPID length check lives here because the
 * failure it catches is invisible everywhere else.
 */
export function register() {
  try {
    assertVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  } catch (error) {
    console.error("[push]", error instanceof Error ? error.message : error);
  }
}
