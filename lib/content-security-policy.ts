type ContentSecurityPolicyOptions = {
  isDevelopment?: boolean;
  supabaseUrl?: string;
  /** PayMongo is dark until Phase 5. See the note on `frame-src` below. */
  paymentsEnabled?: boolean;
};

/**
 * The app's Content Security Policy.
 *
 * `strict-dynamic` plus a per-request nonce is the whole design: scripts Next
 * emits inline carry the nonce, anything they load inherits trust, and nothing
 * else executes. That makes the host allowlist in `script-src` almost
 * irrelevant, which is the point.
 *
 * Sources are added only when a feature actually needs them. An allowed origin
 * for a feature that is not built yet is a standing weakening of the policy for
 * no benefit, so:
 *
 *   - Google Maps is absent. This is a pickup-only platform. The branch card
 *     uses a static image and an outbound directions link, neither of which
 *     needs a script or an XHR origin.
 *   - PayMongo is gated behind `paymentsEnabled` and stays off until the online
 *     prepay rail ships.
 */
export function contentSecurityPolicy(
  nonce: string,
  options: ContentSecurityPolicyOptions = {}
): string {
  const isDevelopment =
    options.isDevelopment ?? process.env.NODE_ENV !== "production";
  const supabaseUrl =
    options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseHost = getHttpsHost(supabaseUrl);

  // Realtime needs the wss:// origin as well as https://.
  const supabaseConnect = supabaseHost
    ? ` https://${supabaseHost} wss://${supabaseHost}`
    : "";
  const supabaseImg = supabaseHost ? ` https://${supabaseHost}` : "";

  const paymentsConnect = options.paymentsEnabled
    ? " https://api.paymongo.com"
    : "";
  const paymentsFrame = options.paymentsEnabled
    ? " https://*.paymongo.com"
    : "";

  return [
    `default-src 'self'`,
    // 'unsafe-eval' is development only: the dev server's React refresh
    // transform requires it, production must never carry it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDevelopment ? " 'unsafe-eval'" : ""
    }`,
    // 'unsafe-inline' on styles is unavoidable while React writes inline style
    // attributes. It is a far smaller risk than inline script and there is no
    // nonce-based path for it that React supports today.
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob:${supabaseImg}`,
    // The landing hero is a self-hosted loop. No third party serves video here,
    // and none should: an embed would drag in its own script origin.
    `media-src 'self'`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self'${supabaseConnect}${paymentsConnect}`,
    `frame-src 'self'${paymentsFrame}`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

function getHttpsHost(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}
