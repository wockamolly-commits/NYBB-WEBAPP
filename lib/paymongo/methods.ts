export const ONLINE_METHODS = ["qrph", "gcash", "maya", "card"] as const;
export type OnlineMethod = (typeof ONLINE_METHODS)[number];

export type PaymongoMethodSettings = Partial<Record<OnlineMethod, boolean>>;

export function isOnlineMethod(value: unknown): value is OnlineMethod {
  return typeof value === "string" && (ONLINE_METHODS as readonly string[]).includes(value);
}

export function enabledOnlineMethods(
  settings: PaymongoMethodSettings | null | undefined,
  paymongoEnabled: boolean,
): OnlineMethod[] {
  if (!paymongoEnabled) return [];
  return ONLINE_METHODS.filter((method) => settings?.[method] === true);
}

export const MIN_ONLINE_PAYMENT_CENTS: Record<OnlineMethod, number> = {
  qrph: 100,
  gcash: 100,
  maya: 100,
  card: 100,
};

export function canPayOnline(amountCents: number, method: OnlineMethod): boolean {
  return Number.isFinite(amountCents) && amountCents >= MIN_ONLINE_PAYMENT_CENTS[method];
}
