"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { syncCustomerAuthIdentity, toAuthPhone } from "@/lib/auth/customer-identity";
import { getStorefrontSession } from "@/lib/auth/session";
import type { AccountFormState } from "@/lib/auth/types";

const profileSchema = z.object({
  displayName: z.string().trim().max(120),
  phone: z
    .string()
    .trim()
    .max(40)
    .refine((value) => value === "" || toAuthPhone(value) !== null, {
      error: "Use a Philippine mobile number such as 09186056360.",
    }),
});

export async function updateCustomerProfile(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await getStorefrontSession();
  if (!session) return { status: "error", message: "Your sign-in expired. Sign in again." };

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check the name and mobile number, then try again.",
    };
  }

  const { error } = await session.supabase.from("customer_profiles").upsert(
    {
      id: session.user.id,
      display_name: parsed.data.displayName || null,
      phone: parsed.data.phone || null,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[account] profile update failed:", error.message);
    return { status: "error", message: "We could not save those details. Try again." };
  }

  // The profile row is authoritative. This best-effort mirror only makes the
  // Supabase Authentication dashboard's Display name and Phone columns useful.
  after(() =>
    syncCustomerAuthIdentity(session.user.id, {
      displayName: parsed.data.displayName || null,
      phone: parsed.data.phone || null,
    }),
  );

  revalidatePath("/account");
  revalidatePath("/checkout");
  return { status: "success", message: "Pickup details saved." };
}
