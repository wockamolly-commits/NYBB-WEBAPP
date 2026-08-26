import type { NextConfig } from "next";
// Imported rather than repeated. This file and the two writers,
// app/(workspace)/workspace/menu/actions.ts and
// scripts/ingest-legacy-images.ts, have to name the same bucket: a pattern
// that does not match is not a warning, it is next/image refusing to optimize
// every menu photograph. The script and this file DID disagree, with the
// script writing to "menu" and this pattern permitting "menu-images", and
// nothing could catch it because no code path read both.
import { MENU_IMAGE_BUCKET } from "./lib/staff/menu-image-limits";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;

if (supabaseHost) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHost,
    pathname: `/storage/v1/object/public/${MENU_IMAGE_BUCKET}/**`,
  });
}

// QR Ph images are short-lived payment instructions returned by PayMongo. They
// are not part of the menu archive and must not use its long optimized cache.
if (process.env.NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY) {
  remotePatterns.push({
    protocol: "https",
    hostname: "*.paymongo.com",
    pathname: "/**",
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
      {
        // A cached service worker outlives the deploy that replaced it and
        // keeps running old code on a device nobody ever closes. The browser
        // caps this file's own cache at 24 hours by default, which is 24 hours
        // of a counter tablet handling notifications with last week's worker.
        // `updateViaCache: "none"` at the registration in StaffPushOptIn.tsx is
        // the other half of this; a header alone does not cover the update
        // check the browser makes on its own.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
