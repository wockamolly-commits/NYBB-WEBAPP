/**
 * Canonical origin for this deployment.
 *
 * Order matters. An explicit NEXT_PUBLIC_SITE_URL always wins, because that is
 * the production domain once it is pointed. VERCEL_URL is the per-deployment
 * hostname and is correct for previews. The localhost fallback keeps
 * `new URL()` in metadataBase from throwing during a local build.
 *
 * Trailing slashes are stripped so callers can always concatenate a path.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
