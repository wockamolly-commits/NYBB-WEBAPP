import "server-only";

import { mockPaymentsEnabled } from "./mock";

export const PAYMONGO_API_BASE = "https://api.paymongo.com/v1";

export function getPaymongoSecretKey(): string {
  return process.env.PAYMONGO_SECRET_KEY ?? "";
}

export function getPaymongoPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY || null;
}

export function getPaymongoWebhookSecret(): string {
  return process.env.PAYMONGO_WEBHOOK_SECRET ?? "";
}

export function paymongoConfigured(): boolean {
  return Boolean(getPaymongoSecretKey() && getPaymongoPublicKey());
}

/**
 * Whether THIS deployment can actually carry an online payment through.
 *
 * Distinct from `app_settings.paymongo_enabled`, and the distinction is the
 * whole point. The flag is the owner deciding the business takes QR Ph; it
 * lives in one database that staging, development and production all share.
 * This is a fact about the machine serving the request: real keys, or the
 * development simulator standing in for them.
 *
 * Switching the flag on without this check offered QR Ph on the production
 * deployment, which has neither, so the pay button failed on every press with
 * a message that invited the customer to try again. Ask both, always: the
 * owner's intent and this deployment's ability to honour it.
 */
export function onlinePaymentsServiceable(): boolean {
  return mockPaymentsEnabled() || paymongoConfigured();
}
