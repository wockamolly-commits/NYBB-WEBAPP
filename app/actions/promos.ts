"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  PROMO_DISMISS_COOKIE,
  parseDismissed,
  promoDismissCookieOptions,
  serializeDismissed,
} from "@/lib/promos/dismissal";

/**
 * Putting the promo bar away.
 *
 * A Server Action rather than a click handler, so the button is a real submit
 * inside a real form and the bar can be dismissed with JavaScript switched off.
 * That matters more here than it looks: the bar is the one piece of storefront
 * chrome a customer might actively want gone, and a dismiss control that
 * silently did nothing would be worse than no control at all.
 *
 * The key is opaque and nothing is trusted about it. It is written into a list
 * that only ever hides things, so the worst a forged key can do is hide a promo
 * from the browser that sent it. The length check is there to stop a long
 * request body becoming a long response header, not to authenticate anything.
 *
 * The whole layout is revalidated because the bar is rendered in it, the same
 * reach `chooseStore` uses for the same reason.
 *
 * Note that this file exports exactly one async function and nothing else. A
 * `"use server"` module may only export async functions, and a constant or a
 * type alongside passes both tsc and the unit tests before failing the build,
 * which is why the keys, the cookie options and the parse all live in
 * `lib/promos/dismissal.ts` where they are testable.
 */
export async function dismissPromo(formData: FormData): Promise<void> {
  const key = formData.get("key");
  if (typeof key !== "string" || key === "" || key.length > 16) return;

  const jar = await cookies();
  const existing = parseDismissed(jar.get(PROMO_DISMISS_COOKIE)?.value);

  // Newest first, so the bound in serializeDismissed forgets the oldest
  // dismissal rather than the one that was just made.
  const next = serializeDismissed([key, ...existing]);
  jar.set(PROMO_DISMISS_COOKIE, next, promoDismissCookieOptions);

  revalidatePath("/", "layout");
}
