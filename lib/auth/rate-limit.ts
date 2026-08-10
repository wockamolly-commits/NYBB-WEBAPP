import "server-only";

import { createHash } from "node:crypto";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";

type Decision = { allowed: true } | { allowed: false; message: string };

function emailNamespace(action: string, email: string): string {
  const digest = createHash("sha256").update(email).digest("hex").slice(0, 24);
  return `${action}:${digest}`;
}

export async function checkOtpRequestLimit(
  email: string,
  address: string | null,
): Promise<Decision> {
  const cooldown = await withinAddressLimit({
    action: emailNamespace("otp_request_cooldown", email),
    address,
    limit: 1,
    windowSeconds: 60,
  });
  if (!cooldown) {
    return { allowed: false, message: "Wait 60 seconds before requesting another code." };
  }

  const window = await withinAddressLimit({
    action: emailNamespace("otp_request_window", email),
    address,
    limit: 5,
    windowSeconds: 15 * 60,
  });
  return window
    ? { allowed: true }
    : { allowed: false, message: "Too many code requests. Try again in about 15 minutes." };
}

export async function checkOtpVerifyLimit(
  email: string,
  address: string | null,
): Promise<Decision> {
  const allowed = await withinAddressLimit({
    action: emailNamespace("otp_verify", email),
    address,
    limit: 8,
    windowSeconds: 10 * 60,
  });
  return allowed
    ? { allowed: true }
    : { allowed: false, message: "Too many attempts. Try again in about 10 minutes." };
}
