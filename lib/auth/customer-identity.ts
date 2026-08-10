import "server-only";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";

/**
 * customer_profiles remains the source of truth for customer pickup details.
 * This module only mirrors those details into auth.users so the Supabase
 * Authentication dashboard can identify a customer without opening the
 * application profile table.
 *
 * Every operation is best-effort. A dashboard mirror must never turn a
 * successful customer profile save into a failure.
 */

const PH_MOBILE = /^639\d{9}$/;

/** Convert a Philippine mobile number to GoTrue's stored E.164 shape. */
export function toAuthPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const compact = raw.replace(/[\s()\-.]/g, "");
  let normalized: string;

  if (compact.startsWith("+63")) {
    normalized = `63${compact.slice(3)}`;
  } else if (compact.startsWith("0")) {
    normalized = `63${compact.slice(1)}`;
  } else {
    normalized = compact;
  }

  return PH_MOBILE.test(normalized) ? normalized : null;
}

type CustomerIdentity = {
  displayName?: string | null;
  phone?: string | null;
};

/**
 * Mirror customer details into the fields shown by the Supabase Auth dashboard.
 * Display name is user metadata. Phone is the real auth.users phone field,
 * because metadata does not populate the dashboard's Phone column.
 */
export async function syncCustomerAuthIdentity(
  userId: string,
  identity: CustomerIdentity,
): Promise<void> {
  if (!adminConfigured()) {
    console.warn("[customer-identity] no service-role client; skipping auth sync");
    return;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error || !data.user) {
    console.error(
      "[customer-identity] auth lookup failed:",
      error?.message ?? "user not found",
    );
    return;
  }

  const displayName = identity.displayName?.trim() || null;
  const authPhone = toAuthPhone(identity.phone);
  const metadata = data.user.user_metadata ?? {};
  const nameChanged = Boolean(displayName) && metadata.display_name !== displayName;

  // GoTrue ignores an empty phone in an admin update. This mirror can set or
  // correct a number, while clearing an Auth phone remains a dashboard action.
  const phoneChanged = Boolean(authPhone) && data.user.phone !== authPhone;
  if (!nameChanged && !phoneChanged) return;

  const attributes: { user_metadata?: Record<string, unknown>; phone?: string } = {};
  if (nameChanged) {
    attributes.user_metadata = { ...metadata, display_name: displayName };
  }
  if (phoneChanged && authPhone) {
    attributes.phone = authPhone;
  }

  const updated = await admin.auth.admin.updateUserById(userId, attributes);
  if (!updated.error) return;

  console.error("[customer-identity] auth sync failed:", updated.error.message);

  // auth.users.phone is unique. If a household reuses a number, retry the
  // metadata update by itself so the display name is still mirrored.
  if (attributes.phone && attributes.user_metadata) {
    const retry = await admin.auth.admin.updateUserById(userId, {
      user_metadata: attributes.user_metadata,
    });
    if (retry.error) {
      console.error("[customer-identity] name-only retry failed:", retry.error.message);
    }
  }
}
