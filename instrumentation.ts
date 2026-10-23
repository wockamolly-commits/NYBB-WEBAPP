import * as Sentry from "@sentry/nextjs";
import { paymongoConfigurationProblem } from "@/lib/paymongo/config";
import { assertVapidKey } from "@/lib/push/vapid";

/**
 * Runs once per server start. Both checks live here because the failures they
 * catch are invisible everywhere else: a wrong VAPID key makes the opt-in
 * button vanish with no error, and a wrong PayMongo key pair either hides
 * checkout's payment step or, worse, takes a payment nothing can confirm.
 *
 * Sentry starts first so a failure in either check is reported too. Nothing
 * in this app runs on the edge runtime (Proxy is Node.js since Next 16), so
 * there is one server config, not two.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  try {
    assertVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  } catch (error) {
    console.error("[push]", error instanceof Error ? error.message : error);
  }

  const paymentProblem = paymongoConfigurationProblem();
  if (paymentProblem) console.error("[payment]", paymentProblem);
}

// Every server error Next catches (a Server Component that throws, a failed
// Server Action, a route handler) is handed to Sentry with the route it came
// from. Without this they reach only Vercel's runtime log, which nobody reads
// until a customer complains.
export const onRequestError = Sentry.captureRequestError;
