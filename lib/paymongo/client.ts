import "server-only";
import { PAYMONGO_API_BASE, getPaymongoSecretKey } from "./config";

export class PaymongoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PaymongoError";
  }
}

function basicAuth(key: string): string {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const RETRIES_MS = [500, 1_000];

export async function paymongoFetch<T>(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    key?: string;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const key = init.key ?? getPaymongoSecretKey();
  if (!key) throw new PaymongoError("PayMongo key not configured", 500);

  const method = (init.method ?? "GET").toUpperCase();
  const retryable = Boolean(init.idempotencyKey) || ["GET", "HEAD", "DELETE"].includes(method);

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let response: Response;
    try {
      response = await fetch(`${PAYMONGO_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: basicAuth(key),
          "Content-Type": "application/json",
          ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timeout);
      if (retryable && attempt < RETRIES_MS.length) {
        await pause(RETRIES_MS[attempt]);
        continue;
      }
      throw new PaymongoError(
        controller.signal.aborted ? "PayMongo timed out" : "PayMongo could not be reached",
        controller.signal.aborted ? 504 : 503,
        controller.signal.aborted ? "request_timeout" : "network_error",
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: T;
      errors?: { detail?: string; code?: string }[];
    } | null;
    if (response.ok) return (payload?.data ?? payload) as T;

    const first = payload?.errors?.[0];
    if (retryable && response.status >= 500 && attempt < RETRIES_MS.length) {
      await pause(RETRIES_MS[attempt]);
      continue;
    }
    throw new PaymongoError(
      first?.detail ?? `PayMongo request failed (${response.status})`,
      response.status,
      first?.code,
    );
  }
}
