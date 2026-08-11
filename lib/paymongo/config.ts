import "server-only";

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
