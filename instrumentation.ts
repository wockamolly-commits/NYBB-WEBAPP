import { paymongoConfigurationProblem } from "@/lib/paymongo/config";
import { assertVapidKey } from "@/lib/push/vapid";

/**
 * Runs once per server start. Both checks live here because the failures they
 * catch are invisible everywhere else: a wrong VAPID key makes the opt-in
 * button vanish with no error, and a wrong PayMongo key pair either hides
 * checkout's payment step or, worse, takes a payment nothing can confirm.
 */
export function register() {
  try {
    assertVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  } catch (error) {
    console.error("[push]", error instanceof Error ? error.message : error);
  }

  const paymentProblem = paymongoConfigurationProblem();
  if (paymentProblem) console.error("[payment]", paymentProblem);
}
