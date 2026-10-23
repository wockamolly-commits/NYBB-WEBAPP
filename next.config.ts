import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
// Imported rather than repeated. This file and the two writers,
// app/(workspace)/workspace/menu/actions.ts and
// scripts/ingest-legacy-images.ts, have to name the same bucket: a pattern
// that does not match is not a warning, it is next/image refusing to optimize
// every menu photograph. The script and this file DID disagree, with the
// script writing to "menu" and this pattern permitting "menu-images", and
// nothing could catch it because no code path read both.
import { MENU_IMAGE_BUCKET } from "./lib/staff/menu-image-limits";
import { VOUCHER_POSTER_BUCKET } from "./lib/staff/voucher-poster-limits";

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;

if (supabaseHost) {
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHost,
    pathname: `/storage/v1/object/public/${MENU_IMAGE_BUCKET}/**`,
  });
  // Voucher posters (0077). Every upload is a fresh path, so the year-long
  // optimized cache below is as safe here as it is for the menu.
  remotePatterns.push({
    protocol: "https",
    hostname: supabaseHost,
    pathname: `/storage/v1/object/public/${VOUCHER_POSTER_BUCKET}/**`,
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
    // Geolocation is allowed for this origin only. The counter picker offers
    // the nearest counter from the customer's position, worked out in the
    // browser and never sent here (see lib/branches/nearest.ts). `(self)`
    // rather than `*` keeps the Google Maps frame on /contact from asking: an
    // embedded document gets no location from this page. Camera and
    // microphone are still denied outright, because nothing uses them.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
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
  // The development-only "N" badge defaults to the bottom left, which is
  // where the storefront's back to top button lives, and it sits on top of
  // the button and swallows its clicks. Development only: production renders
  // no badge at all.
  devIndicators: {
    position: "bottom-right",
  },
  images: {
    remotePatterns,
    minimumCacheTTL: IMAGE_MINIMUM_CACHE_TTL,
  },
  experimental: {
    serverActions: {
      // The framework default is 1 MB, covering the whole multipart request
      // body, not just the file inside it. MENU_IMAGE_MAX_BYTES (5 MB)
      // advertises and checks a 5 MB photograph on both sides of the upload,
      // but without this every request over 1 MB, which is most phone
      // photographs, was rejected before uploadMenuItemImage or
      // uploadMenuOptionImage ever ran: no friendly message printed, because
      // no action body executed. 6mb rather than 5mb leaves room for the
      // multipart boundaries and part headers the raw body carries beside
      // the file, per the framework docs' own 10-20 KB rule of thumb.
      //
      // 9mb since the voucher poster became required: VOUCHER_POSTER_MAX_BYTES
      // is 8 MB, and at 6mb every poster between 6 and 8 MB was refused by the
      // framework with no message, so the create form could not be submitted
      // with a file it had just accepted. The create form also carries the
      // voucher's own fields, which are a few KB.
      bodySizeLimit: "9mb",
    },
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

// Sentry's build step. It does two things here and deliberately nothing else.
//
// tunnelRoute sends browser error reports to /monitoring on this site, which
// forwards them to Sentry, so the Content Security Policy keeps connect-src at
// 'self' and an ad blocker that drops sentry.io does not drop the report.
// proxy.ts excludes the route from its matcher: it carries no session.
//
// Source maps, which turn a minified stack back into file and line, are
// uploaded only when SENTRY_AUTH_TOKEN is set on the build, and deleted from
// the output afterwards so the public never downloads them. Without the token
// the build still succeeds and errors still arrive, just with minified stacks.
//
// No tracing, so the per route manifest and the server dependency
// instrumentation that only tracing reads are both switched off.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  routeManifestInjection: false,
  buildTimeInstrumentation: false,
  telemetry: false,
});
