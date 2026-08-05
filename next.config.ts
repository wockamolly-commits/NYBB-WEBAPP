import type { NextConfig } from "next";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;

if (supabaseHost) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHost,
    pathname: "/storage/v1/object/public/menu-images/**",
  });
}

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Pickup-only: nothing in this app reads location, so geolocation is denied
    // outright rather than self-allowed. The reference project needed
    // geolocation=(self) for delivery address capture; that feature does not
    // exist here.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

// Hold optimized menu images for a year.
//
// This is safe specifically because every upload lands at a unique
// randomUUID() path, so replacing an image always produces a NEW URL and the
// old one is effectively immutable. The usual warning against long TTLs (you
// cannot invalidate an optimized image) does not apply under that scheme.
//
// It is also load-bearing on cost. The constraint on the Supabase free tier is
// egress, not storage: without this, Next's 4h default wins and every original
// is re-fetched six times a day, per size variant, per format, per edge region.
const IMAGE_MINIMUM_CACHE_TTL = 31_536_000; // seconds = 365 days

const nextConfig: NextConfig = {
  images: {
    remotePatterns,
    minimumCacheTTL: IMAGE_MINIMUM_CACHE_TTL,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
