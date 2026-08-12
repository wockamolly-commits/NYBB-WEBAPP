export type RefundActionResult =
  | { ok: true; settled: boolean; message: string }
  | { ok: false; error: string };

export const REFUND_REASONS = [
  "duplicate",
  "fraudulent",
  "requested_by_customer",
  "others",
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  requested_by_customer: "Customer asked for it",
  duplicate: "Duplicate payment",
  fraudulent: "Fraudulent",
  others: "Other",
};

export function isRefundReason(value: unknown): value is RefundReason {
  return typeof value === "string" && (REFUND_REASONS as readonly string[]).includes(value);
}

export type RefundFailureKind = "rejected" | "indeterminate";

function providerStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { name?: unknown; status?: unknown };
  return candidate.name === "PaymongoError" && typeof candidate.status === "number"
    ? candidate.status
    : null;
}

/** Only a clear provider-side 4xx rejection can release a refund reservation. */
export function classifyRefundFailure(error: unknown): RefundFailureKind {
  const status = providerStatus(error);
  return status !== null && status >= 400 && status < 500 && status !== 429
    ? "rejected"
    : "indeterminate";
}
