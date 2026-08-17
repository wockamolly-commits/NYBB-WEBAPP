"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signInEmailSchema } from "@/lib/auth/email";
import { checkOtpRequestLimit, checkOtpVerifyLimit } from "@/lib/auth/rate-limit";
import {
  requestedStaffNextPath,
  safeCustomerNextPath,
  safeStaffNextPath,
} from "@/lib/auth/redirect";
import type { LoginState, VerifyOtpState } from "@/lib/auth/types";
import { clientAddress } from "@/lib/rate-limit/address";
import {
  provisionConfiguredSuperAdmin,
  resolveStaffEmailAccess,
  type StaffEmailAccess,
} from "@/lib/staff/access";
import {
  createCustomerClient,
  createStaffClient,
  supabaseConfigured,
} from "@/lib/supabase/server";

const requestSchema = z.object({
  // Trims and folds before checking the format. See `lib/auth/email.ts` for why
  // the order matters and why the rule is not written inline here.
  email: signInEmailSchema,
  next: z.string().max(240).optional(),
});

const verifySchema = requestSchema.extend({
  token: z.string().trim().regex(/^\d{6}$/),
});

async function staffAccess(email: string): Promise<StaffEmailAccess> {
  try {
    return await resolveStaffEmailAccess(email);
  } catch (error) {
    console.error("[auth] workspace access lookup failed:", error);
    throw new Error("WORKSPACE_LOOKUP_FAILED");
  }
}

export async function requestOtp(
  previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = requestSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }
  if (!supabaseConfigured()) {
    return { status: "error", message: "Sign-in is not connected in this environment yet." };
  }

  const address = clientAddress(await headers());
  const rate = await checkOtpRequestLimit(parsed.data.email, address);
  if (!rate.allowed) {
    return { ...previous, email: parsed.data.email, message: rate.message };
  }

  let access: StaffEmailAccess;
  try {
    access = await staffAccess(parsed.data.email);
  } catch {
    return { status: "error", message: "We could not check account access. Try again." };
  }

  const supabase = access ? await createStaffClient() : await createCustomerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: access?.kind === "staff" ? false : true },
  });
  if (error) {
    console.error("[auth] signInWithOtp failed:", error.status, error.message);
    return {
      status: "error",
      email: parsed.data.email,
      message:
        error.status === 429
          ? "Too many code requests. Wait a little and try again."
          : "We could not send a code. Check the address and try again.",
    };
  }

  const now = Date.now();
  return {
    status: "sent",
    email: parsed.data.email,
    expiresAt: now + 10 * 60 * 1000,
    resendAvailableAt: now + 60 * 1000,
    message: previous.status === "sent" ? "A fresh code is on its way." : undefined,
  };
}

export async function verifyOtp(
  _previous: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") || undefined,
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Enter the six-digit code from your email." };
  }

  const address = clientAddress(await headers());
  const rate = await checkOtpVerifyLimit(parsed.data.email, address);
  if (!rate.allowed) return { status: "error", message: rate.message };

  let access: StaffEmailAccess;
  try {
    access = await staffAccess(parsed.data.email);
  } catch {
    return { status: "error", message: "We could not check account access. Try again." };
  }

  const supabase = access ? await createStaffClient() : await createCustomerClient();
  let lastError: string | null = null;
  const verificationTypes =
    access?.kind === "staff"
      ? (["email", "magiclink"] satisfies EmailOtpType[])
      : (["email", "signup", "magiclink"] satisfies EmailOtpType[]);
  for (const type of verificationTypes) {
    const result = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type,
    });
    if (result.error) {
      lastError = result.error.message;
      continue;
    }

    if (result.data.user && access) {
      try {
        if (access.kind === "super_admin") {
          await provisionConfiguredSuperAdmin(result.data.user);
        } else if (result.data.user.id !== access.profileId) {
          throw new Error("The verified user does not match the authorized profile.");
        }
      } catch (error) {
        console.error("[auth] workspace profile preparation failed:", error);
        await supabase.auth.signOut({ scope: "local" });
        return {
          status: "error",
          message: "Workspace access could not be prepared. Ask the Super Admin to check your access.",
        };
      }
    } else if (result.data.user) {
      const { error: profileError } = await supabase
        .from("customer_profiles")
        .upsert({ id: result.data.user.id }, { onConflict: "id", ignoreDuplicates: true });
      if (profileError) {
        console.error("[auth] customer profile creation failed:", profileError.message);
      }
    }

    if (access) redirect(safeStaffNextPath(parsed.data.next));
    if (requestedStaffNextPath(parsed.data.next)) {
      redirect("/account?workspace=denied");
    }
    redirect(safeCustomerNextPath(parsed.data.next));
  }

  console.error("[auth] verifyOtp failed:", lastError);
  return {
    status: "error",
    message: "That code is invalid or expired. Check it or request a new one.",
  };
}
