/** Development-only payment mode. It must never be enabled in production. */
export function mockPaymentsEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  enabled: string | undefined = process.env.MOCK_PAYMENTS_ENABLED,
): boolean {
  return nodeEnv !== "production" && enabled === "true";
}

/** Keeps the development simulator from settling a real PayMongo refund. */
export function isMockPaymentId(value: string): boolean {
  return value.startsWith("mock_pay_");
}

/**
 * Whether PayMongo's own test-mode simulation link may be shown on screen.
 *
 * PayMongo returns a `test_url` beside the QR in test mode, and it exists
 * because the QR itself is NOT a toy: "In test mode, QR Ph generates real QR
 * codes. Do not scan and pay them, it will process a real transaction." The
 * link is how a test payment is completed without moving money.
 *
 * Two conditions, both required, for the same reason `mockPaymentsEnabled`
 * has its production gate. A live key never produces a test_url, so the key
 * check is belt and braces; the NODE_ENV check is the one that matters, since
 * a "complete this payment" link on a real customer's screen would be a way to
 * take an order without paying for it.
 */
export function paymentSimulationVisible(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  secretKey: string | undefined = process.env.PAYMONGO_SECRET_KEY,
): boolean {
  return nodeEnv !== "production" && (secretKey ?? "").startsWith("sk_test_");
}
