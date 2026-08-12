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
