import "server-only";

import { mockPaymentsEnabled } from "./mock";

export const PAYMONGO_API_BASE = "https://api.paymongo.com/v1";

/**
 * PayMongo issues keys in matched pairs, one pair per mode. The mode is in the
 * prefix and nowhere else, which is what makes a mismatched pair silent: both
 * halves are real keys, both authenticate, and the intent is simply created in
 * an account the customer's payment will never reach.
 */
const SECRET_KEY_PATTERN = /^sk_(test|live)_[A-Za-z0-9]+$/;
const PUBLIC_KEY_PATTERN = /^pk_(test|live)_[A-Za-z0-9]+$/;

export function getPaymongoSecretKey(): string {
  return process.env.PAYMONGO_SECRET_KEY ?? "";
}

export function getPaymongoPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY || null;
}

export function getPaymongoWebhookSecret(): string {
  return process.env.PAYMONGO_WEBHOOK_SECRET ?? "";
}

/** "test" or "live" read from a key's prefix, or null if it is not a key. */
export function paymongoKeyMode(key: string): "test" | "live" | null {
  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
  return null;
}

/** The mode this deployment transacts in, once its keys agree on one. */
export function paymongoMode(): "test" | "live" | null {
  return paymongoConfigured() ? paymongoKeyMode(getPaymongoSecretKey()) : null;
}

/**
 * What is wrong with this deployment's PayMongo credentials, in a sentence.
 *
 * Null means nothing is wrong, and that includes the deliberate case of no
 * credentials at all: a deployment that does not take online payment is not
 * misconfigured, it is dark. Every other answer is a paste that looked fine.
 *
 * These are checked because each one fails silently at a different distance
 * from the paste. Swapped keys authenticate. Mismatched modes authenticate and
 * create a real intent in the wrong account. A missing webhook secret is the
 * worst of them and the quietest: payment succeeds, the customer is charged,
 * every delivery of the signed event is rejected as a bad signature, the order
 * never reaches the counter, and the expiry sweep cancels it while the money
 * sits with PayMongo. Refusing to offer the rail is the cheaper failure, so
 * this participates in the same gate that `paymongoConfigured` answers.
 */
export function paymongoConfigurationProblem(): string | null {
  const secret = getPaymongoSecretKey();
  const publicKey = getPaymongoPublicKey() ?? "";
  const webhookSecret = getPaymongoWebhookSecret();

  if (!secret && !publicKey && !webhookSecret) return null;

  if (!secret) return "PAYMONGO_SECRET_KEY is not set, so no payment can be started.";
  if (!publicKey) {
    return "NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY is not set, so no payment method can be created.";
  }
  if (!SECRET_KEY_PATTERN.test(secret)) {
    return "PAYMONGO_SECRET_KEY is not a PayMongo secret key (it should read sk_test_... or sk_live_...).";
  }
  if (!PUBLIC_KEY_PATTERN.test(publicKey)) {
    return "NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY is not a PayMongo public key (it should read pk_test_... or pk_live_...).";
  }
  if (paymongoKeyMode(secret) !== paymongoKeyMode(publicKey)) {
    return (
      "The PayMongo keys are from different modes: PAYMONGO_SECRET_KEY is " +
      `${paymongoKeyMode(secret)} and NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY is ${paymongoKeyMode(publicKey)}.`
    );
  }
  if (!webhookSecret) {
    return (
      "PAYMONGO_WEBHOOK_SECRET is not set. A payment would be taken and never " +
      "confirmed, because the signed event that marks it paid cannot be verified."
    );
  }
  return null;
}

export function paymongoConfigured(): boolean {
  return Boolean(getPaymongoSecretKey()) && paymongoConfigurationProblem() === null;
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
